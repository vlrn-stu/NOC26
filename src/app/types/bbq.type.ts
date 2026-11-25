/** When the weather is good enough to grill outside. */
export interface BbqRules {
    /** Coldest air temperature people still want to sit outside in, in Kelvin. */
    minTemperatureK: number;
    /** Most rain in one hour that still lets the fire burn, in mm. */
    maxPrecipitationMm: number;
    /** Local hours a barbecue can start and must end by, for the best-time suggestion. */
    earliestHour: number;
    latestHour: number;
}
