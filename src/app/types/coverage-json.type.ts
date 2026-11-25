/**
 * Minimal types for the CoverageJSON responses returned by the EDR cube query.
 * Spec: https://docs.ogc.org/cs/21-069r2/21-069r2.html
 */

/** A regularly spaced axis, e.g. longitude from `start` to `stop` in `num` steps. */
export interface RegularAxis {
    start: number;
    stop: number;
    num: number;
}

/** An axis given as an explicit list of values, e.g. vertical levels or times. */
export interface ValuesAxis<T = number | string> {
    values: T[];
}

export interface GridDomain {
    type: "Domain";
    domainType: "Grid";
    axes: {
        /** Longitude in degrees (CRS:84). */
        x: RegularAxis;
        /** Latitude in degrees (CRS:84). Note: runs from north to south. */
        y: RegularAxis;
        /** Vertical levels, e.g. `[2]` for 2 m above ground. */
        z?: ValuesAxis<number>;
        /** ISO 8601 timestamps. */
        t: ValuesAxis<string>;
    };
}

export interface CoverageParameter {
    type: "Parameter";
    unit: {symbol: string};
    observedProperty: {label: {en: string}};
}

export interface NdArray {
    type: "NdArray";
    dataType: "float";
    /** Order of the axes in `values`, e.g. `['t', 'y', 'x', 'z']`. */
    axisNames: string[];
    /** Size of each axis in `axisNames`. */
    shape: number[];
    /** Flattened values; `null` where the requested area lies outside the model domain. */
    values: (number | null)[];
}

export interface Coverage {
    type: "Coverage";
    domain: GridDomain;
    parameters: Record<string, CoverageParameter>;
    ranges: Record<string, NdArray>;
}

/** One point of the EDR position query: the values of every parameter there, one per time. */
export interface PointCoverage {
    type: "Coverage";
    domain: {
        type: "Domain";
        axes: {x: ValuesAxis<number>; y: ValuesAxis<number>; t?: ValuesAxis<string>};
    };
    ranges: Record<string, NdArray>;
}

/** A position query over several times may answer with one coverage per time. */
export interface PointCoverageCollection {
    type: "CoverageCollection";
    coverages: PointCoverage[];
}
