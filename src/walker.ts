import { type } from "os"

import { extendsMetadata, mergeDecorators } from "./extends"
import { createClass, CustomTypeDefinition, metadata } from "./helpers"
import { parseClass } from "./parser"
import {
    Class,
    ClassReflection,
    ConstructorReflection,
    DECORATOR_KEY,
    DecoratorOption,
    DecoratorOptionId,
    DecoratorTargetType,
    DESIGN_PARAMETER_TYPE,
    DESIGN_RETURN_TYPE,
    DESIGN_TYPE,
    GenericTemplateDecorator,
    GenericTypeDecorator,
    MethodReflection,
    NativeDecorator,
    NativeParameterDecorator,
    ParameterPropertiesDecorator,
    ParameterPropertyReflection,
    ParameterReflection,
    PrivateDecorator,
    PropertyReflection,
    Reflection,
    TypeDecorator,
    TypeOverride, DecoratorId
} from "./types"

// --------------------------------------------------------------------- //
// ------------------------------- TYPES ------------------------------- //
// --------------------------------------------------------------------- //

type TypedReflection = ClassReflection | MethodReflection | PropertyReflection | ParameterReflection | ConstructorReflection | ParameterPropertyReflection
type WalkMemberVisitor = (value: TypedReflection, ctx: WalkMemberContext) => TypedReflection | undefined
type WalkParentVisitor = (current: ClassReflection, ctx: WalkParentContext) => ClassReflection

interface WalkMemberContext {
    target: Class
    classPath: Class[]
    parent: Reflection
    memberVisitor: WalkMemberVisitor
}

interface WalkParentContext {
    target: Class
    memberVisitor: WalkMemberVisitor
    parentVisitor: WalkParentVisitor
    classPath: Class[]
}

// --------------------------------------------------------------------- //
// -------------------------- VISITOR HELPERS -------------------------- //
// --------------------------------------------------------------------- //

function getDecorators(targetClass: Class, targetType: DecoratorTargetType, target: string, index?: number) {
    const natives: NativeDecorator[] = Reflect.getOwnMetadata(DECORATOR_KEY, targetClass) || []
    const result = []
    for (const { allowMultiple, inherit, applyTo, removeApplied, ...item } of natives) {
        const par = item as NativeParameterDecorator
        if (item.targetType === targetType && item.target === target && (index == undefined || par.targetIndex === index)) {
            result.push({ ...item.value, [DecoratorOptionId]: <DecoratorOption>{ allowMultiple, inherit, applyTo, removeApplied } })
        }
    }
    return result
}

function getTypeOverrideFromDecorator(decorators: any[]) {
    const getType = (type: string | Class | CustomTypeDefinition) => typeof type === "object" ? createClass({ definition: type }) : type
    const override = decorators.find((x: TypeDecorator): x is TypeDecorator => x.kind === "Override")
    if (!override) return
    // extract type from the callback
    const rawType = metadata.isCallback(override.type) ? override.type({}) : override.type
    return { type: Array.isArray(rawType) ? [getType(rawType[0])] : getType(rawType), genericParams: override.genericParams }
}

class GenericMap {
    private maps: Map<string, TypeOverride>[] = []
    constructor(types: Class[]) {
        this.maps = this.createMaps(types)
    }
    private createMaps(types: Class[]) {
        const result = []
        for (const type of types) {
            const parent: Class = Object.getPrototypeOf(type)
            const templates = this.getTemplates(parent)
            if (!templates) throw new Error(`Configuration Error: ${parent.name} uses string template type @reflect.type(<string>) but doesn't specify @generic.template()`)
            const types = this.getTypes(type)
            if (!types) throw new Error(`Configuration Error: ${type.name} inherit from generic class but doesn't use @generic.type()`)
            if (templates.length !== types.length) throw new Error(`Configuration Error: Number of parameters mismatch between @generic.template() on ${parent.name} and @generic.type() on ${type.name}`)
            result.unshift(new Map(templates.map((x, i) => ([x, types[i]]))))
        }
        return result
    }
    private getTemplates(target: Class) {
        const decorator = getDecorators(target, "Class", target.name)
            .find((x: GenericTemplateDecorator): x is GenericTemplateDecorator => x.kind === "GenericTemplate")
        return decorator?.templates
    }
    private getTypes(target: Class) {
        const decorator = getDecorators(target, "Class", target.name)
            .find((x: GenericTypeDecorator): x is GenericTypeDecorator => x.kind === "GenericType")
        return decorator?.types
    }
    get(rawType: string | string[]) {
        const isArray = Array.isArray(rawType)
        const type = isArray ? rawType[0] : rawType
        const result = this.maps.reduce((val, map) => {
            // keep looking at the real type
            // if it is string then it still a generic type template
            return typeof val === "string" ? map.get(val)! : val
        }, type as TypeOverride) as Class
        return isArray ? [result] : result
    }
}

// --------------------------------------------------------------------- //
// ------------------------- PURIFIER VISITORS ------------------------- //
// --------------------------------------------------------------------- //

namespace memberVisitors {
    export function addsDesignTypes(meta: TypedReflection, ctx: WalkMemberContext): TypedReflection {
        const getType = (type: any, i: number) => type[i] === Array ? [Object] : type[i]
        if (meta.kind === "Method") {
            const returnType: any = Reflect.getOwnMetadata(DESIGN_RETURN_TYPE, ctx.target.prototype, meta.name)
            return { ...meta, returnType }
        }
        else if (metadata.isParameterProperties(meta)) {
            const parTypes: any[] = Reflect.getOwnMetadata(DESIGN_PARAMETER_TYPE, ctx.target) || []
            return { ...meta, type: getType(parTypes, meta.index) }
        }
        else if (meta.kind === "Property") {
            const type: any = Reflect.getOwnMetadata(DESIGN_TYPE, ctx.target.prototype, meta.name)
            return { ...meta, type }
        }
        else if (meta.kind === "Parameter" && ctx.parent.kind === "Constructor") {
            const parTypes: any[] = Reflect.getOwnMetadata(DESIGN_PARAMETER_TYPE, ctx.target) || []
            return { ...meta, type: getType(parTypes, meta.index) }
        }
        else if (meta.kind === "Parameter" && ctx.parent.kind === "Method") {
            const parTypes: any[] = Reflect.getOwnMetadata(DESIGN_PARAMETER_TYPE, ctx.target.prototype, ctx.parent.name) || []
            return { ...meta, type: getType(parTypes, meta.index) }
        }
        else
            return meta
    }

    export function addsDecorators(meta: TypedReflection, ctx: WalkMemberContext): TypedReflection {
        if (meta.kind === "Parameter" || metadata.isParameterProperties(meta)) {
            const targetName = meta.kind === "Parameter" ? ctx.parent.name : "constructor"
            const decorators = getDecorators(ctx.target, "Parameter", targetName, meta.index)
            return { ...meta, decorators: meta.decorators.concat(decorators) }
        }
        else if (meta.kind === "Method" || meta.kind === "Property" || meta.kind === "Class") {
            const decorators = getDecorators(ctx.target, meta.kind, meta.name)
            return { ...meta, decorators: meta.decorators.concat(decorators) }
        }
        return meta
    }

    export function addsTypeOverridden(meta: TypedReflection, ctx: WalkMemberContext): TypedReflection {
        if (meta.kind === "Constructor" || meta.kind === "Class") return meta
        const overridden = getTypeOverrideFromDecorator(meta.decorators)
        if (!overridden) return meta
        if (meta.kind === "Method")
            return { ...meta, returnType: overridden.type }
        return { ...meta, type: overridden.type }
    }

    export function addsGenericOverridden(meta: TypedReflection, ctx: WalkMemberContext): TypedReflection {
        const isGeneric = (decorator: any): decorator is { type: TypeOverride[], genericParams: (string | string[])[] } => {
            const singleType = Array.isArray(decorator.type) ? decorator.type[0] : decorator.type
            return typeof singleType === "string" || decorator.genericParams.length > 0
        }
        const isString = (decorator: any): decorator is { type: (string | string[])[], genericParams: (string | string[])[] } => {
            const singleType = Array.isArray(decorator.type) ? decorator.type[0] : decorator.type
            return typeof singleType === "string"
        }
        const getGenericType = (map: GenericMap, decorator: any) => {
            const converted = []
            for (const param of decorator.genericParams) {
                converted.push(map.get(param))
            }
            return createClass({ parent: decorator.type as Class, genericParams: converted })
        }
        if (meta.kind === "Constructor" || meta.kind === "Class") return meta
        const decorator = getTypeOverrideFromDecorator(meta.decorators)
        if (!decorator || !decorator.type || !isGeneric(decorator)) return meta
        const map = new GenericMap(ctx.classPath)
        const type = isString(decorator) ? map.get(decorator.type as any) : getGenericType(map, decorator)
        // if current class has @generic.template() then process
        if (meta.kind === "Method") {
            // if type is not a generic template type then return immediately
            return { ...meta, returnType: type }
        }
        return { ...meta, type }
    }

    export function addsTypeClassification(meta: TypedReflection, ctx: WalkMemberContext): TypedReflection | undefined {
        const get = (type: any): "Class" | "Array" | "Primitive" | undefined => {
            if (type === undefined) return undefined
            else if (Array.isArray(type)) return "Array"
            else if (metadata.isCustomClass(type)) return "Class"
            else return "Primitive"
        }
        if (meta.kind === "Method")
            return { ...meta, typeClassification: get(meta.returnType) }
        else if (meta.kind === "Property" || meta.kind === "Parameter")
            return { ...meta, typeClassification: get(meta.type) }
        else if (meta.kind === "Class")
            return { ...meta, typeClassification: "Class" }
        return meta
    }

    export function addsParameterProperties(meta: TypedReflection, ctx: WalkMemberContext): TypedReflection | undefined {
        if (metadata.isParameterProperties(meta) && ctx.parent.kind === "Class") {
            const isParamProp = ctx.parent.decorators.some((x: ParameterPropertiesDecorator) => x.type === "ParameterProperties")
            return !!isParamProp ? meta : undefined
        }
        return meta
    }

    export function removeIgnored(meta: TypedReflection, ctx: WalkMemberContext): TypedReflection | undefined {
        if (meta.kind === "Property" || meta.kind === "Method") {
            const decorator = meta.decorators.find((x: PrivateDecorator): x is PrivateDecorator => x.kind === "Ignore")
            return !decorator ? meta : undefined
        }
        return meta
    }
}

namespace parentVisitors {
    function appendDecorators(members: any[], copied: any) {
        const option: DecoratorOption = copied[DecoratorOptionId]
        if (option.allowMultiple) return members.concat(copied)
        const result = []
        let merged = false;
        for (const member of members) {
            if (member[DecoratorId] === copied[DecoratorId]){
                merged = true
                result.push(copied)
            }
            else
                result.push(member)
        }
        if(!merged)
            result.push(copied)
        return result
    }
    export function processApplyTo(current: ClassReflection, ctx: WalkParentContext): ClassReflection {
        if (current.type === ctx.target) {
            const decorators = []
            const removed = []
            // loop through class decorators
            for (const decorator of current.decorators) {
                const option: DecoratorOption = decorator[DecoratorOptionId]
                const applyTo = Array.isArray(option.applyTo) ? option.applyTo : [option.applyTo]
                // copy decorator to member
                for (const member of [...current.properties, ...current.methods]) {
                    if (applyTo.some(x => x === member.name)) {
                        member.decorators = appendDecorators(member.decorators, decorator)
                    }
                }
                if (option.removeApplied && applyTo.length > 0)
                    removed.push(decorator)
                else
                    decorators.push(decorator)
            }
            current.decorators = decorators
            if (removed.length > 0)
                current.removedDecorators = removed
        }
        return current
    }
}

// --------------------------------------------------------------------- //
// ------------------------------ WALKERS ------------------------------ //
// --------------------------------------------------------------------- //


/**
 * Walk into type member metadata (properties, parameters, methods, ctor etc)
 * @param meta type metadata
 * @param ctx traversal context
 */
function walkMetadataMembers(meta: TypedReflection, ctx: WalkMemberContext) {
    // apply visitor for each metadata traversed
    const result = ctx.memberVisitor(meta, ctx)
    for (const key in result) {
        // walk into type metadata members specified
        if (["parameters", "properties", "methods", "ctor"].some(x => x === key)) {
            const item: TypedReflection | TypedReflection[] = (result as any)[key]
            if (Array.isArray(item)) {
                const node = item.map((x, i) => walkMetadataMembers(x, { ...ctx, parent: result }));
                (result as any)[key] = node.filter(x => !!x)
            }
            else {
                const node = walkMetadataMembers(item, { ...ctx, parent: item });
                (result as any)[key] = node
            }
        }
    }
    return result as ClassReflection
}

function walkMembers(type: Class, memberVisitor: WalkMemberVisitor, classPath: Class[]) {
    const rawMeta = parseClass(type)
    return walkMetadataMembers(rawMeta, { memberVisitor, parent: rawMeta, target: type, classPath })
}

/**
 * Walk into type super class
 * @param type type to reflect
 */
function walkParents(type: Class, ctx: WalkParentContext): ClassReflection {
    const defaultRef: ClassReflection = {
        super: Object,
        kind: "Class", type: Object, name: "Object",
        ctor: {} as ConstructorReflection,
        methods: [], properties: [], decorators: []
    }
    // walk first into the parent members
    const parent: Class = Object.getPrototypeOf(type)
    // walk the super class member first
    const parentMeta = !!parent.prototype ?
        walkParents(parent, { ...ctx, classPath: ctx.classPath.concat(type) }) : defaultRef
    // then walk the current type members
    const childMeta = walkMembers(type, ctx.memberVisitor, ctx.classPath)
    // merge current type and super class members
    const merged = extendsMetadata(childMeta, parentMeta)
    return ctx.parentVisitor(merged, ctx)
}

export { walkParents, memberVisitors, parentVisitors, WalkMemberVisitor, GenericMap }