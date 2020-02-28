# tinspector

[![Build Status](https://travis-ci.org/plumier/tinspector.svg?branch=master)](https://travis-ci.org/plumier/tinspector)
[![Coverage Status](https://coveralls.io/repos/github/plumier/tinspector/badge.svg?branch=master)](https://coveralls.io/github/plumier/tinspector?branch=master) 
[![Greenkeeper badge](https://badges.greenkeeper.io/plumier/tinspector.svg)](https://greenkeeper.io/)

TypeScript reflection (introspection) library. Extract JavaScript/TypeScript type into metadata information such as class name, methods, parameters and their appropriate data types

## Example

```typescript
import reflect from "tinspector"

class Awesome{
    awesome(){}
}

class MyAwesomeClass extends Awesome {
    @decorateMethod({ cache: "20s" })
    myAwesomeMethod(stringPar:string, numberPar:number): number {
        return Math.random()
    }
}

const metadata = reflect(MyAwesomeClass)
```

Result of `metadata` variable above is like below
    
```javascript
{
    kind: 'Class',
    name: 'MyAwesomeClass',
    type: MyAwesomeClass,
    decorators: [],
    properties: [],
    ctor: {
        kind: 'Constructor',
        name: 'constructor',
        parameters: []
    },
    methods: [
        {
            kind: 'Method',
            name: 'myAwesomeMethod',
            parameters: [
                {
                    kind: 'Parameter',
                    name: 'stringPar',
                    type: String,
                    decorators: [],
                    properties: {}
                },
                {
                    kind: 'Parameter',
                    name: 'numberPar',
                    type: Number,
                    decorators: [],
                    properties: {}
                }
            ],
            decorators: [{ cache: '20s' }],
            returnType: Number,
        },
        {
            kind: 'Method',
            name: 'awesome',
            parameters: [],
            decorators: [],
            returnType: undefined,
        }
    ]
}
```

## Features

- [x] Inspect function
- [x] Inspect module or file
- [x] Inspect class
- [x] Inspect class with inheritance
- [x] Inspect getter and setter
- [x] Inspect methods
- [x] Inspect parameters
- [x] Supported inspect destructured parameter
- [x] Supported inspect rest parameter
- [x] Supported inspect parameter with complex default value
- [x] (TypeScript only) Inspect decorators
- [x] (TypeScript only) Inspect parameter properties
- [x] (TypeScript only) Inspect type information 
- [x] (TypeScript only) Configurable decorator (inheritable / allow multiple)


## TypeScript Requirement
To be able to inspect type information its required to enable configuration below in `tsconfig.json`

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true           
  }
}
```

## Inspect Type Information
TypeScript when `emitDecoratorMetadata` enabled, TypeScript will add type information during compile time. This make it possible to extract typescript type information during runtime. 

> **CAVEAT**
>  
> TypeScript `emitDecoratorMetadata` has some limitation. 
> * Declaration should have at least one decorator to get metadata (type information)
> * Array element type information not included. 
> * Generic type information not included.

Based on limitation above its required at least have one decorator to make tinspector to be able to extract type information: 

```typescript 
import reflect from "tinspector"

class Awesome {
    @reflect.noop()
    awesome(multiply:number): number { return 1 }
}
```

tinspector will be able to get type information of the method's return type and parameters of the `awesome` method above. Note that we applied `@reflect.noop()` decorator on the `awesome` method. `@reflect.noop()` does nothing except to force TypeScript to emit metadata information.

```typescript 
import reflect from "tinspector"

class Awesome {
    @reflect.noop()
    aweProperty:number
}
```

Above code showing that we able to get type information of a property. 

```typescript 
import reflect from "tinspector"

@reflect.noop()
class Awesome {
    constructor(multiply:number){}
}
```
Above code showing that we able to get type information of parameters of the constructor, by applying decorator on the class level. 

## Inspect Array and Generic Type
To get type information of an Array and Generic type its required to use `@reflect.type()` decorator on the declaration.

```typescript 
import reflect from "tinspector"

class Awesome {
    @reflect.type([Number])
    awesome(multiply:number): Array<number> {}
}
```

Above code showing that we able to get method's return type information by providing `@reflect.type([Number])`. Note that the `[Number]` is an array of `Number`. 

```typescript 
import reflect from "tinspector"

class Option { 
    data:string
}

class Awesome {
    @reflect.type(Option)
    awesome(multiply:number): Partial<Option> {}
}
```

We will be able to get generic type information such as `Partial`, `Required` etc by applying `@reflect.type()` like above. 

## Inspect Parameter Properties
TypeScript has parameter properties feature, which make it possible to use constructor parameter as property. tinspector able to extract parameter properties type information by using `@reflect.parameterProperties()` decorator.

```typescript 
import reflect from "tinspector"

@reflect.parameterProperties()
class Awesome {
    constructor(public multiply:number){}
}
```

## Custom Decorator 
Tinspector able to extract classes/methods/properties/parameters decorated with predefined decorators. There are predefined decorators should be use to be able for Tinspector to inspect the decorators

| Decorator           | Description                                                                          |
| ------------------- | ------------------------------------------------------------------------------------ |
| `decorateClass`     | Decorate class with object specified in parameter                                    |
| `decorateProperty`  | Decorate property with object specified in parameter                                 |
| `decorateMethod`    | Decorate method with object specified in parameter                                   |
| `decorateParameter` | Decorate parameter with object specified in parameter                                |
| `decorate`          | Decorate any (class, property, method, parameter) with object specified in parameter |
| `mergeDecorator`    | Merge multiple decorators into one, useful on creating custom decorator               |

Example usage

```typescript
import { decorateClass, decorateProperty } from "tinspector"

@decorateClass({ message: "hello world" })
class Awesome {
    @decorateProperty({ message: "awesome!" })
    awesome: number = 10
}
```

Parameter passed on each decorator can be any object contains value, methods etc, those value will be returned when the class metadata extracted.

Create your own custom decorator by creating function returns decorator above

```typescript
import { decorateMethod } from "tinspector"

// create custom decorator
function cache(duration:number){
    return decorateMethod({ type: "Cache", duration })
}

class Awesome{
    @cache() // use it like usual decorator
    awesome(){}
}
```

Use `mergeDecorator` to combine multiple decorator on custom decorator


```typescript
import { decorateMethod, mergeDecorator } from "tinspector"

// create custom decorator
function cacheAndDelay(duration:number){
    return mergeDecorator([
        decorateMethod({ type: "Cache", duration }), 
        decorateMethod({ type: "Delay", duration })
    ])
}
```

## Decorator Option
Decorator can be further configured to match the behavior you need like below.

```typescript
decorateMethod(<data>, <option>)
```

Option is a simple object with properties: 

* `inherit` `Boolean` If `false` decorator will not be merged on the derived class. Default `true` 
* `allowMultiple` `Boolean` If `false` throw error when multiple decorator applied on class. Also when set `false` will prevent super class decorator being merged into derived class when already exists. When set `false`, decorator required to have `DecoratorId` property to identify the similar decorator.


Example disable decorator inheritance

```typescript
@decorateClass({ log:true }, { inherit: false })
class Awesome {
    awesome(){}
}

// { log: true} will not inherited on this class
class IamAwesome extends Awesome{ }
```

Example disable multiple decorator on inheritance

```typescript
import { DecoratorId, decorateClass } from "tinspector"

function log(){
    return @decorateClass({ [DecoratorId]: "logging",  log:true }, { allowMultiple: false })
}

@log()
class Awesome {
    awesome(){}
}

// parent decorator will not merged
// guaranteed derived class only have single decorator with specific ID
@log()
class IamAwesome extends Awesome{ }
```