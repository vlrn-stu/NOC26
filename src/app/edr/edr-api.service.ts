import {HttpClient, HttpParams} from "@angular/common/http";
import {Injectable, inject} from "@angular/core";
import {map, Observable} from "rxjs";
import {Coverage, PointCoverage} from "../types/coverage-json.type";
import {EdrCollection} from "../types/edr-collection.type";
import {EdrNoDataError} from "./edr-error";
import {EdrParameter} from "../types/edr-parameters.type";

/** Bounding box in longitude/latitude degrees: [minLon, minLat, maxLon, maxLat]. */
export type LonLatBbox = [number, number, number, number];

const CUBE_QUERY = {
    crs: "CRS:84",
    format: "CoverageJSON",
} as const;

@Injectable({providedIn: "root"})
export class EdrApiService {
    private readonly http = inject(HttpClient);

    /**
     * Fetches the grid of `parameter` inside `bbox` at `time` (ISO 8601, one of `getTimes()`), from
     * the EDR service (OGC Environmental Data Retrieval) of the parameter's dataset.
     */
    getCube(parameter: EdrParameter, bbox: LonLatBbox, time: string): Observable<Coverage> {
        const url = `${this.collectionUrl(parameter)}/cube`;
        const params = this.queryParams(parameter, time).set("bbox", bbox.join(","));
        return this.http.get<Coverage | null>(url, {params}).pipe(map(requireData));
    }

    /**
     * Fetches the value of `parameter` at one point at `time`, or `NaN` where the dataset has no
     * value. The EDR position query needs `crs=CRS:84`; without it the service answers 204.
     */
    getPointValue(parameter: EdrParameter, lon: number, lat: number, time: string): Observable<number> {
        const url = `${this.collectionUrl(parameter)}/position`;
        const params = this.queryParams(parameter, time).set("coords", `POINT(${lon} ${lat})`);
        return this.http.get<PointCoverage | null>(url, {params}).pipe(
            map(requireData),
            map(coverage => coverage.ranges[parameter.parameterName]?.values[0] ?? Number.NaN)
        );
    }

    /** Forecast times the parameter's collection has data for, as ISO 8601 strings. */
    getTimes(parameter: EdrParameter): Observable<string[]> {
        return this.http
            .get<EdrCollection>(this.collectionUrl(parameter), {params: {f: "json"}})
            .pipe(map(collection => collection.extent.temporal?.values ?? []));
    }

    private collectionUrl(parameter: EdrParameter): string {
        const collection = encodeURIComponent(parameter.collectionId);
        return `${parameter.dataset.baseUrl}/collections/${collection}`;
    }

    private queryParams(parameter: EdrParameter, time: string): HttpParams {
        let params = new HttpParams()
            .set("parameter-name", parameter.parameterName)
            .set("crs", CUBE_QUERY.crs)
            .set("f", CUBE_QUERY.format)
            .set("datetime", time);
        if (parameter.z !== undefined) {
            params = params.set("z", parameter.z);
        }
        return params;
    }
}

/** An empty answer (`204 No Content`) means the service has no data for the request. */
function requireData<T>(coverage: T | null): T {
    if (coverage === null) {
        throw new EdrNoDataError();
    }
    return coverage;
}
