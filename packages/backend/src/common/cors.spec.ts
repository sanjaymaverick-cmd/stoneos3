import { parseFrontendOrigins } from "./cors";

describe("parseFrontendOrigins", () => {
  it("uses the standard local frontend when unset", () => {
    expect(parseFrontendOrigins(undefined)).toEqual(["http://localhost:3000"]);
  });

  it("supports multiple configured frontend origins", () => {
    expect(parseFrontendOrigins("http://localhost:3001, http://localhost:3101"))
      .toEqual(["http://localhost:3001", "http://localhost:3101"]);
  });

  it("ignores empty entries", () => {
    expect(parseFrontendOrigins("http://localhost:3001, ,"))
      .toEqual(["http://localhost:3001"]);
  });
});
