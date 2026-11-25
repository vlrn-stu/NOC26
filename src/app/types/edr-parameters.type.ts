import {EdrDataset} from "./edr-datasets.type";

/**
 * Which data to request from an EDR service. Every parameter lives in a specific collection of a
 * specific dataset, so all three are needed. List all collections and their parameters at
 * `${dataset.baseUrl}/collections`. Ready-to-use parameters are defined in
 * `src/app/consts/parameters.ts`.
 */
export interface EdrParameter {
    dataset: EdrDataset;
    collectionId: string;
    parameterName: string;
    z?: string;
    /**
     * For vector quantities such as wind: the EDR parameter names of the east (u) and north (v)
     * components, requested together. `parameterName` then only names the combined quantity and is
     * not sent; point values are the vector's length (e.g. wind speed).
     */
    components?: [u: string, v: string];
}
