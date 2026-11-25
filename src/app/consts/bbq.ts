import {BbqRules} from "../types/bbq.type";

/** 10 °C and no more than a trace of rain. */
export const BBQ_RULES: BbqRules = {
    minTemperatureK: 283.15,
    maxPrecipitationMm: 0.1,
};
