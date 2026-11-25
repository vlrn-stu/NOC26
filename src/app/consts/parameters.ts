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
    /** Precipitation that fell during the hour ending at the forecast time, in mm (kg/m²). */
    precipitation1h: {
        dataset: ALADIN_SLOVAKIA,
        collectionId: "sd:SHMU-Aladin-Slovakia_single-level_3",
        parameterName: "surfprec-total_gnd-surf_stat:acc/PT1H",
    },
    /** Wind 10 m above ground, in m/s. */
    wind10m: {
        dataset: ALADIN_SLOVAKIA,
        collectionId: "sd:SHMU-Aladin-Slovakia_height-above-ground_3",
        parameterName: "wind",
        z: "10",
        components: ["u-component-of-wind", "v-component-of-wind"],
    },
} satisfies Record<string, EdrParameter>;
