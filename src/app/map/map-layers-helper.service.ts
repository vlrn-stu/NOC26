import {signal} from "@angular/core";
import OlMap from "ol/Map";
import Overlay from "ol/Overlay";
import {fromLonLat, toLonLat} from "ol/proj";
import {forkJoin, map, Subscription} from "rxjs";
import {describeEdrError} from "../edr/edr-error";
import {EdrGridSource, LOAD_ERROR_PROPERTY} from "../edr/edr-grid-source";
import {LegendData} from "../types/legend.type";
import {BitmapLayer} from "../visualizations/bitmap/bitmap-layer";

/** A layer with a legend, and whether it is shown. */
export interface LegendLayer {
    legend: LegendData;
    visible: boolean;
}

/** One layer's values at the chosen place for every forecast hour. */
export interface PlaceSeries {
    title: string;
    /** `parameterName` of the layer's EDR parameter. */
    parameterName: string;
    /** Values in the data's unit, keyed by ISO 8601 time. */
    values: Map<string, number>;
}

/** The place the user chose and its forecast. */
export interface PlaceForecast {
    lon: number;
    lat: number;
    /** Empty while loading or after an error. */
    series: PlaceSeries[];
    loading: boolean;
    error?: string;
}

export class MapLayersHelperService {
    private readonly loadErrorsSignal = signal<string[]>([]);
    readonly loadErrors = this.loadErrorsSignal.asReadonly();

    private readonly legendLayersSignal = signal<LegendLayer[]>([]);
    readonly legendLayers = this.legendLayersSignal.asReadonly();

    private readonly availableTimesSignal = signal<string[]>([]);
    readonly availableTimes = this.availableTimesSignal.asReadonly();

    private readonly placeForecastSignal = signal<PlaceForecast | undefined>(undefined);
    readonly placeForecast = this.placeForecastSignal.asReadonly();

    private map?: OlMap;
    private marker?: Overlay;
    private placeRequest?: Subscription;

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

    /** Fills `legendLayers` with the layers that have a legend, bottom layer first. */
    public collectLegends(map: OlMap): void {
        this.legendLayersSignal.set(
            this.legendBitmapLayers(map).map(layer => ({
                legend: layer.getLegend()!,
                visible: layer.getVisible(),
            }))
        );
    }

    /** Shows or hides the layer whose legend has `title`. */
    public setLayerVisible(title: string, visible: boolean): void {
        if (!this.map) {
            return;
        }
        this.legendBitmapLayers(this.map)
            .find(layer => layer.getLegend()?.title === title)
            ?.setVisible(visible);
        this.legendLayersSignal.update(layers =>
            layers.map(layer => (layer.legend.title === title ? {...layer, visible} : layer))
        );
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

    /** A click on the map chooses that place; `markerElement` marks the chosen place. */
    public listenForClicks(map: OlMap, markerElement: HTMLElement): void {
        this.map = map;
        this.marker = new Overlay({
            element: markerElement,
            positioning: "center-center",
            stopEvent: false,
        });
        map.addOverlay(this.marker);
        map.on("singleclick", event => {
            const [lon, lat] = toLonLat(event.coordinate, map.getView().getProjection());
            this.selectPlace(lon, lat, false);
        });
    }

    /**
     * Chooses a place and loads the forecast of every layer with a legend there, for all
     * `availableTimes`. With `pan`, the map also moves to the place.
     */
    public selectPlace(lon: number, lat: number, pan: boolean): void {
        if (!this.map) {
            return;
        }
        const view = this.map.getView();
        const coordinate = fromLonLat([lon, lat], view.getProjection());
        this.marker?.setPosition(coordinate);
        if (pan) {
            view.animate({center: coordinate, zoom: Math.max(view.getZoom() ?? 8, 8.5), duration: 450});
        }

        this.placeRequest?.unsubscribe();
        const times = this.availableTimesSignal();
        if (times.length === 0) {
            this.placeForecastSignal.set({
                lon,
                lat,
                series: [],
                loading: false,
                error: "No forecast yet",
            });
            return;
        }
        this.placeForecastSignal.set({lon, lat, series: [], loading: true});
        const requests = this.legendBitmapLayers(this.map)
            .filter(layer => layer.getSource() !== null)
            .map(layer => {
                const source = layer.getSource()!;
                return source.getSeriesAt(lon, lat, times[0], times[times.length - 1]).pipe(
                    map(values => ({
                        title: layer.getLegend()!.title,
                        parameterName: source.getParameter().parameterName,
                        values,
                    }))
                );
            });
        this.placeRequest = forkJoin(requests).subscribe({
            next: series => this.placeForecastSignal.set({lon, lat, series, loading: false}),
            error: (error: unknown) =>
                this.placeForecastSignal.set({
                    lon,
                    lat,
                    series: [],
                    loading: false,
                    error: describeEdrError(error),
                }),
        });
    }

    /** Forgets the chosen place. */
    public closePlace(): void {
        this.placeRequest?.unsubscribe();
        this.marker?.setPosition(undefined);
        this.placeForecastSignal.set(undefined);
    }

    private legendBitmapLayers(map: OlMap): BitmapLayer[] {
        return map
            .getAllLayers()
            .filter(layer => layer instanceof BitmapLayer)
            .filter(layer => layer.getLegend() !== undefined);
    }

    private edrSources(map: OlMap): EdrGridSource[] {
        return map
            .getAllLayers()
            .map(layer => layer.getSource())
            .filter(source => source instanceof EdrGridSource);
    }
}
