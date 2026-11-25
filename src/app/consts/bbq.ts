import {BbqRules} from "../types/bbq.type";

/** 10 °C, no more than a trace of rain, between 10:00 and 22:00. */
export const BBQ_RULES: BbqRules = {
    minTemperatureK: 283.15,
    maxPrecipitationMm: 0.1,
    earliestHour: 10,
    latestHour: 22,
};
