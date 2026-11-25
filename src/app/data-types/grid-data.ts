import {Coverage} from "../types/coverage-json.type";
import {LonLatBbox} from "../edr/edr-api.service";

/**
 * A regular grid of scalar values in longitude/latitude.
 *
 * `values` are stored row by row, starting with the northernmost row; each row goes from west to
 * east. Missing values are `NaN`.
 */
export class GridData {
    constructor(
        readonly width: number,
        readonly height: number,
        /** Coordinates of the outermost grid points: [minLon, minLat, maxLon, maxLat]. */
        readonly extent: LonLatBbox,
        readonly values: Float32Array
    ) {}

    /** Distance between two neighbouring grid points in degrees of longitude. */
    get cellWidth(): number {
        return this.width > 1 ? (this.extent[2] - this.extent[0]) / (this.width - 1) : 0;
    }

    /** Distance between two neighbouring grid points in degrees of latitude. */
    get cellHeight(): number {
        return this.height > 1 ? (this.extent[3] - this.extent[1]) / (this.height - 1) : 0;
    }

    /** Converts one parameter of a CoverageJSON grid with a single time and vertical level. */
    static fromCoverage(coverage: Coverage, parameterName: string): GridData {
        const {x, y} = coverage.domain.axes;
        const range = coverage.ranges[parameterName];
        if (!range) {
            throw new Error(`Parameter '${parameterName}' is missing in the coverage`);
        }
        if (range.axisNames.indexOf("y") > range.axisNames.indexOf("x")) {
            throw new Error("Expected the values to be ordered by rows (y before x)");
        }

        const values = new Float32Array(x.num * y.num);
        // CoverageJSON may list rows from south to north; GridData always starts in the north.
        const southFirst = y.start < y.stop;
        for (let row = 0; row < y.num; row++) {
            const sourceRow = southFirst ? y.num - 1 - row : row;
            for (let column = 0; column < x.num; column++) {
                const value = range.values[sourceRow * x.num + column];
                values[row * x.num + column] = value ?? Number.NaN;
            }
        }

        const extent: LonLatBbox = [
            Math.min(x.start, x.stop),
            Math.min(y.start, y.stop),
            Math.max(x.start, x.stop),
            Math.max(y.start, y.stop),
        ];
        return new GridData(x.num, y.num, extent, values);
    }
}
