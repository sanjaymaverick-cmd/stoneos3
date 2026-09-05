import { pickFields } from "./pick-fields";

describe("pickFields", () => {
  it("keeps allowed keys that are present", () => {
    expect(pickFields({ a: 1, b: 2 }, ["a", "b"])).toEqual({ a: 1, b: 2 });
  });

  it("drops anything not named, which is the entire point", () => {
    // The QA run set a row's primary key and a foreign factoryId this way.
    const body = { runtimeHours: 8, id: "attacker-chosen-uuid", factoryId: "someone-elses-factory" };
    expect(pickFields(body, ["runtimeHours"])).toEqual({ runtimeHours: 8 });
  });

  it("omits allowed keys that are absent rather than writing undefined", () => {
    // Writing an explicit undefined would blank a column on an upsert.
    expect(pickFields({ a: 1 }, ["a", "b"])).toEqual({ a: 1 });
    expect("b" in pickFields({ a: 1 }, ["a", "b"])).toBe(false);
  });

  it("treats an explicitly-undefined value as absent", () => {
    expect("a" in pickFields({ a: undefined }, ["a"])).toBe(false);
  });

  it("keeps null, which is a legitimate value to write", () => {
    expect(pickFields({ a: null }, ["a"])).toEqual({ a: null });
  });

  it("keeps falsy values", () => {
    expect(pickFields({ a: 0, b: "", c: false }, ["a", "b", "c"])).toEqual({ a: 0, b: "", c: false });
  });

  it("ignores inherited properties, so a prototype cannot smuggle a value", () => {
    const parent = { sneaky: "inherited" };
    const child = Object.create(parent);
    child.legit = "own";
    expect(pickFields(child, ["legit", "sneaky"])).toEqual({ legit: "own" });
  });

  it("does not let a crafted __proto__ or constructor key through", () => {
    const body = JSON.parse('{"__proto__": {"polluted": true}, "constructor": "x", "ok": 1}');
    expect(pickFields(body, ["ok", "__proto__", "constructor"])).toEqual({ ok: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each([[null], [undefined], ["a string"], [42], [true]])("returns {} for the non-object %p", (input) => {
    expect(pickFields(input, ["a"])).toEqual({});
  });

  it("returns {} when nothing is allowed", () => {
    expect(pickFields({ a: 1 }, [])).toEqual({});
  });

  it("does not mutate the source", () => {
    const body = { a: 1, b: 2 };
    pickFields(body, ["a"]);
    expect(body).toEqual({ a: 1, b: 2 });
  });

  it("handles an array body without treating indices as fields", () => {
    expect(pickFields([1, 2, 3], ["a"])).toEqual({});
  });
});
