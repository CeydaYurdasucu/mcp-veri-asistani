import { createVerifiedPlan, METRIC_CATALOG_VERSION, metricCatalogPrompt, verifiedMetrics } from "./metric-catalog";

describe("verified metric versioning", () => {
  it("catalog version is attached to verified plans", () => {
    const match = createVerifiedPlan("Bu ayın toplam cirosu ne kadar?");
    expect(match?.metricVersion).toBe(METRIC_CATALOG_VERSION);
    expect(verifiedMetrics).toHaveLength(10);
  });

  it("Gemini catalog prompt carries the same version", () => {
    const prompt = JSON.parse(metricCatalogPrompt()) as { catalogVersion: string; metrics: unknown[] };
    expect(prompt.catalogVersion).toBe(METRIC_CATALOG_VERSION);
    expect(prompt.metrics).toHaveLength(10);
  });
});
