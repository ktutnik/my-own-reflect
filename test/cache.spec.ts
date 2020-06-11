import { decorateClass, reflect } from "../src"



describe("Cache Function", () => {

    it("Should cache call", () => {
        @decorateClass({ name: "MyClass" })
        class MyClass {
            method(par: string) { }
        }
        const meta1 = reflect(MyClass)
        const meta2 = reflect(MyClass)
        expect(meta1 == meta2).toBe(true)
    })

    it("Should differentiate class with scope", () => {
        const first = (() => {
            @decorateClass({ name: "first" })
            class MyClass {
                method(par: string) { }
            }
            return MyClass
        })()

        const second = (() => {
            @decorateClass({ name: "second" })
            class MyClass {
                method(par: string) { }
            }
            return MyClass
        })()

        expect(second === first).toBe(false)
        const firstMeta = reflect(first)
        const secondMeta = reflect(second)
        expect(firstMeta == secondMeta).toBe(false)
        expect(firstMeta).toMatchSnapshot()
        expect(secondMeta).toMatchSnapshot()
    })

    it("Should able to modify decorator if not use cache", () => {
        class MyClass {
            method(par: string) { }
        }
        const meta1 = reflect(MyClass, { flushCache: true })
        expect(meta1).toMatchSnapshot()
        Reflect.decorate([decorateClass({ lorem: "ipsum" })], MyClass)
        const meta2 = reflect(MyClass)
        expect(meta2).toMatchSnapshot()
    })
})