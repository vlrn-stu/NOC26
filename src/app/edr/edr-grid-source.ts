import {Extent} from "ol/extent";
import {ProjectionLike, transformExtent} from "ol/proj";
import {Signal} from "@angular/core";
import Source from "ol/source/Source";
import {map, Observable, tap} from "rxjs";
import {describeEdrError} from "./edr-error";
import {EdrParameter} from "../types/edr-parameters.type";
import {EdrApiService, LonLatBbox} from "./edr-api.service";
import {GridData} from "../data-types/grid-data";

/**
 * Name of the OpenLayers property holding the last load error. Changes to it fire a
 * "propertychange" event with this `key`.
 */
export const LOAD_ERROR_PROPERTY = "loadError";

/**
 * Extra margin around the visible area, in degrees. It keeps a few grid points around the view
 * when zoomed in, so the edges of the screen are not left without data.
 */
const BBOX_MARGIN_DEG = 0.1;

/** Source of grids of one EDR parameter (e.g. temperature), for the area the map shows. */
export class EdrGridSource extends Source {
    constructor(
        private readonly edrApiService: EdrApiService,
        /** What to fetch, e.g. one of `ALADIN_PARAMETERS`. */
        private readonly parameter: EdrParameter,
        /** Forecast time to show (ISO 8601); the layer redraws when the map renders after a change. */
        private readonly time: Signal<string>
    ) {
        super({attributions: parameter.dataset.attribution});
    }

    /**
     * Longitude/latitude bbox to request for the visible map `extent`, clipped to the area the
     * parameter's dataset covers. Returns `undefined` when the view does not overlap that area.
     */
    getRequestBbox(extent: Extent, projection: ProjectionLike): LonLatBbox | undefined {
        const [minLon, minLat, maxLon, maxLat] = transformExtent(extent, projection, "EPSG:4326");
        const [domainMinLon, domainMinLat, domainMaxLon, domainMaxLat] = this.parameter.dataset.domain;
        const roundDown = (value: number): number => Math.floor(value * 100) / 100;
        const roundUp = (value: number): number => Math.ceil(value * 100) / 100;

        // Rounding to 0.01° keeps the URL short and makes repeated requests for the same area equal.
        const bbox: LonLatBbox = [
            Math.max(roundDown(minLon - BBOX_MARGIN_DEG), domainMinLon),
            Math.max(roundDown(minLat - BBOX_MARGIN_DEG), domainMinLat),
            Math.min(roundUp(maxLon + BBOX_MARGIN_DEG), domainMaxLon),
            Math.min(roundUp(maxLat + BBOX_MARGIN_DEG), domainMaxLat),
        ];
        const overlapsDomain = bbox[0] < bbox[2] && bbox[1] < bbox[3];
        return overlapsDomain ? bbox : undefined;
    }

    /**
     * Fetches the parameter's grid inside `bbox`. Also updates `getLoadError()`: it is set when
     * the request fails and cleared when data arrives.
     */
    getGridData(bbox: LonLatBbox, time: string): Observable<GridData> {
        return this.edrApiService.getCube(this.parameter, bbox, time).pipe(
            map(coverage => GridData.fromCoverage(coverage, this.parameter.parameterName)),
            tap({
                next: () => this.set(LOAD_ERROR_PROPERTY, undefined),
                error: (error: unknown) => this.set(LOAD_ERROR_PROPERTY, describeEdrError(error)),
            })
        );
    }

    /**
     * Fetches the grids of the east (u) and north (v) components of a vector parameter (one with
     * `components`, e.g. wind) inside `bbox`. Updates `getLoadError()` like `getGridData`.
     */
    getVectorData(bbox: LonLatBbox, time: string): Observable<{u: GridData; v: GridData}> {
        const components = this.parameter.components;
        if (!components) {
            throw new Error(`'${this.parameter.parameterName}' has no vector components`);
        }
        const [uName, vName] = components;
        return this.edrApiService.getVectorCube(this.parameter, bbox, time).pipe(
            map(([uCoverage, vCoverage]) => ({
                u: GridData.fromCoverage(uCoverage, uName),
                v: GridData.fromCoverage(vCoverage, vName),
            })),
            tap({
                next: () => this.set(LOAD_ERROR_PROPERTY, undefined),
                error: (error: unknown) => this.set(LOAD_ERROR_PROPERTY, describeEdrError(error)),
            })
        );
    }

    /** What the source fetches. */
    getParameter(): EdrParameter {
        return this.parameter;
    }

    /** The forecast time the layer should show now. */
    getTime(): string {
        return this.time();
    }

    /** Forecast times the parameter has data for. */
    getAvailableTimes(): Observable<string[]> {
        return this.edrApiService.getTimes(this.parameter);
    }

    /** The parameter's values at one point from `start` to `end`, keyed by time. */
    getSeriesAt(lon: number, lat: number, start: string, end: string): Observable<Map<string, number>> {
        return this.edrApiService.getPointSeries(this.parameter, lon, lat, start, end);
    }

    /**
     * Message describing why the last request failed, or `undefined` if it succeeded. To react to
     * changes, listen for "propertychange" events whose `key` is `LOAD_ERROR_PROPERTY`.
     */
    getLoadError(): string | undefined {
        return this.get(LOAD_ERROR_PROPERTY);
    }
}
