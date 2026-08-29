import { organizationImageColumns } from "./organization-image-columns";

describe("organizationImageColumns", () => {
  it("writes the colors of the picture alongside the picture itself", () => {
    expect(
      organizationImageColumns({
        image: "https://blob/organization-images/maps.png",
        colors: { primary: "#fd7b03", accent: "#0ca3b1" },
      }),
    ).toEqual({
      image: "https://blob/organization-images/maps.png",
      imagePrimaryColor: "#fd7b03",
      imageAccentColor: "#0ca3b1",
    });
  });

  it("clears the colors when the picture has none to give", () => {
    expect(
      organizationImageColumns({
        image: "https://blob/organization-images/greyscale.png",
        colors: null,
      }),
    ).toEqual({
      image: "https://blob/organization-images/greyscale.png",
      imagePrimaryColor: null,
      imageAccentColor: null,
    });
  });

  it("clears the accent alone when the logo holds a single hue", () => {
    expect(
      organizationImageColumns({
        image: "https://blob/organization-images/sifi.png",
        colors: { primary: "#0051f1", accent: null },
      }),
    ).toEqual({
      image: "https://blob/organization-images/sifi.png",
      imagePrimaryColor: "#0051f1",
      imageAccentColor: null,
    });
  });

  it("clears all three when the organization removes its picture", () => {
    expect(organizationImageColumns({ image: null, colors: null })).toEqual({
      image: null,
      imagePrimaryColor: null,
      imageAccentColor: null,
    });
  });

  it("touches no column when the request said nothing about the picture", () => {
    expect(organizationImageColumns(undefined)).toEqual({});
  });
});
