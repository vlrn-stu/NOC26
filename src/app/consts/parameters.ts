import {EdrParameter} from "../types/edr-parameters.type";
import {ALADIN_SLOVAKIA} from "./datasets";

/** Parameters of the ALADIN Slovakia model that are ready to use in `EdrGridSource`. */
export const ALADIN_PARAMETERS = {
    temperature2m: {
        dataset: ALADIN_SLOVAKIA,
        collectionId: "sd:SHMU-Aladin-Slovakia_height-above-ground_2",
        parameterName: "temperature",
        z: "2",
    },
} satisfies Record<string, EdrParameter>;
