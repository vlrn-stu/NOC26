import {signal} from "@angular/core";
import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import {Coordinate} from "ol/coordinate";
import {toLonLat} from "ol/proj";
import {catchError, forkJoin, map, Observable, of, Subscription} from "rxjs";
import {describeEdrError} from "../edr/edr-error";
import {EdrGridSource, LOAD_ERROR_PROPERTY} from "../edr/edr-grid-source";
import {LegendData} from "../types/legend.type";
import {BitmapLayer} from "../visualizations/bitmap/bitmap-layer";

/** One layer's value at the place the user clicked. */
export interface PointValue {
    title: string;
    /** `parameterName` of the layer's EDR parameter. */
    parameterName: string;
    /** The value in the data's unit; `NaN` while loading or where there is no data. */
    raw: number;
    /** Formatted with the layer's legend format; `undefined` while loading. */
    value?: string;
    error?: string;
}

/** The place the user clicked and the values of every layer there. */
export interface PointInfo {
    lon: number;
    lat: number;
    time: string;
    values: PointValue[];
}

export class MapLayersHelperService {
    private readonly loadErrorsSignal = signal<string[]>([]);
    readonly loadErrors = this.loadErrorsSignal.asReadonly();

    private readonly legendsSignal = signal<LegendData[]>([]);
    readonly legends = this.legendsSignal.asReadonly();

    private readonly availableTimesSignal = signal<string[]>([]);
    readonly availableTimes = this.availableTimesSignal.asReadonly();

    private readonly pointInfoSignal = signal<PointInfo | undefined>(undefined);
    readonly pointInfo = this.pointInfoSignal.asReadonly();

    private map?: OlMap;
    private popup?: Overlay;
    private clickedCoordinate?: Coordinate;
    private pointRequest?: Subscription;

    /** Keeps `loadErrors` up to date with the load errors of every EDR layer on the map. */
    public listenForLoadErrors(map: OlMap): void {
        const edrSources = this.edrSources(map);

        const updateLoadErrors = (): void => {
            const errors = edrSources.map(source => source.getLoadError());
            this.loadErrorsSignal.set(errors.filter(error => error !== undefined));
        };

        for (const source of edrSources) {
            source.on("propertychange", event => {
                if (event.key === LOAD_ERROR_PROPERTY) {
                    updateLoadErrors();
                }
            });
        }
    }

    /** Fills `legends` with the legends of the map's layers, bottom layer first. */
    public collectLegends(map: OlMap): void {
        const legends = map
            .getAllLayers()
            .filter(layer => layer instanceof BitmapLayer)
            .map(layer => layer.getLegend())
            .filter(legend => legend !== undefined);
        this.legendsSignal.set(legends);
    }

    /**
     * Fills `availableTimes` with the forecast times that every EDR layer on the map has data for,
     * so any chosen time can be drawn by all of them.
     */
    public collectAvailableTimes(map: OlMap): void {
        const edrSources = this.edrSources(map);
        if (edrSources.length === 0) {
            return;
        }
        forkJoin(edrSources.map(source => source.getAvailableTimes())).subscribe({
            next: timesPerSource => {
                const [first, ...others] = timesPerSource.map(times => new Set(times));
                const common = [...first].filter(time => others.every(times => times.has(time)));
                this.availableTimesSignal.set(common.sort((a, b) => Date.parse(a) - Date.parse(b)));
            },
            error: (error: unknown) => {
                this.loadErrorsSignal.update(errors => [...errors, describeEdrError(error)]);
            },
        });
    }

    /**
     * Shows the values of every layer that has a legend at the place the user clicks, in a popup
     * anchored there. `getTime` gives the forecast time to ask for.
     */
    public listenForClicks(map: OlMap, popupElement: HTMLElement, getTime: () => string): void {
        this.map = map;
        this.popup = new Overlay({
            element: popupElement,
            positioning: "bottom-center",
            offset: [0, -14],
            stopEvent: true,
        });
        map.addOverlay(this.popup);
        map.on("singleclick", event => {
            this.clickedCoordinate = event.coordinate;
            this.popup?.setPosition(event.coordinate);
            this.updatePointInfo(getTime());
        });
    }

    /** Asks for the clicked place's values again, e.g. after the forecast time changed. */
    public updatePointInfo(time: string): void {
        if (!this.map || !this.clickedCoordinate) {
            return;
        }
        const projection = this.map.getView().getProjection();
        const [lon, lat] = toLonLat(this.clickedCoordinate, projection);
        const layers = this.map
            .getAllLayers()
            .filter(layer => layer instanceof BitmapLayer)
            .filter(layer => layer.getLegend() !== undefined && layer.getSource() !== null);

        const previous = this.pointInfoSignal();
        const samePlace = previous && previous.lon === lon && previous.lat === lat;
        // Keep the old values visible while the new ones load, so the popup does not jump.
        this.pointInfoSignal.set({
            lon,
            lat,
            time,
            values: layers.map((layer, index) => ({
                title: layer.getLegend()!.title,
                parameterName: layer.getSource()!.getParameter().parameterName,
                raw: Number.NaN,
                value: samePlace ? previous.values[index]?.value : undefined,
            })),
        });

        this.pointRequest?.unsubscribe();
        const requests: Observable<PointValue>[] = layers.map(layer => {
            const legend = layer.getLegend()!;
            const format = legend.formatValue ?? ((value: number) => String(value));
            const source = layer.getSource()!;
            const parameterName = source.getParameter().parameterName;
            return source.getValueAt(lon, lat, time).pipe(
                map(raw => ({
                    title: legend.title,
                    parameterName,
                    raw,
                    value: Number.isNaN(raw) ? "no data" : format(raw),
                })),
                catchError((error: unknown) =>
                    of({
                        title: legend.title,
                        parameterName,
                        raw: Number.NaN,
                        value: "–",
                        error: describeEdrError(error),
                    })
                )
            );
        });
        this.pointRequest = forkJoin(requests).subscribe(values =>
            this.pointInfoSignal.set({lon, lat, time, values})
        );
    }

    /** Hides the popup and forgets the clicked place. */
    public closePointInfo(): void {
        this.pointRequest?.unsubscribe();
        this.clickedCoordinate = undefined;
        this.popup?.setPosition(undefined);
        this.pointInfoSignal.set(undefined);
    }

    private edrSources(map: OlMap): EdrGridSource[] {
        return map
            .getAllLayers()
            .map(layer => layer.getSource())
            .filter(source => source instanceof EdrGridSource);
    }
}
