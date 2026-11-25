import {DecimalPipe, DatePipe} from "@angular/common";
import {
    Component,
    ElementRef,
    OnDestroy,
    afterNextRender,
    computed,
    effect,
    inject,
    linkedSignal,
    untracked,
    viewChild,
} from "@angular/core";
import OlMap from "ol/Map";
import View from "ol/View";
import BaseLayer from "ol/layer/Base";
import TileLayer from "ol/layer/Tile";
import {fromLonLat, transformExtent} from "ol/proj";
import OSM from "ol/source/OSM";
import {BBQ_RULES} from "../consts/bbq";
import {PRECIPITATION_GRADIENT_IN_MM, TEMPERATURE_GRADIENT_IN_KELVIN} from "../consts/gradients";
import {ALADIN_SLOVAKIA} from "../consts/datasets";
import {ALADIN_PARAMETERS} from "../consts/parameters";
import {EdrGridSource} from "../edr/edr-grid-source";
import {EdrApiService} from "../edr/edr-api.service";
import {TimeSliderComponent} from "../time-slider/time-slider";
import {BitmapLayer} from "../visualizations/bitmap/bitmap-layer";
import {LegendComponent} from "../visualizations/legend/legend";
import {MapLayersHelperService} from "./map-layers-helper.service";

const KELVIN_AT_0_CELSIUS = 273.15;

@Component({
    selector: "app-map",
    templateUrl: "./map.html",
    styleUrl: "./map.css",
    imports: [LegendComponent, TimeSliderComponent, DatePipe, DecimalPipe],
})
export class MapComponent implements OnDestroy {
    protected readonly mapLayersHelper: MapLayersHelperService;

    /**
     * The forecast hour every layer shows. Keeps the user's choice while it is still available;
     * otherwise the first hour that is not in the past.
     */
    protected readonly selectedTime = linkedSignal<string[], string>({
        source: () => this.mapLayersHelper.availableTimes(),
        computation: (times, previous) => {
            if (previous && times.includes(previous.value)) {
                return previous.value;
            }
            const hourStart = Date.now() - 60 * 60 * 1000;
            return times.find(time => Date.parse(time) > hourStart) ?? times.at(-1) ?? currentHour();
        },
    });

    /** Whether the clicked place is good for a barbecue at the selected hour. */
    protected readonly bbqVerdict = computed(() => {
        const values = this.mapLayersHelper.pointInfo()?.values ?? [];
        const raw = (parameterName: string): number =>
            values.find(value => value.parameterName === parameterName)?.raw ?? Number.NaN;
        const kelvin = raw(ALADIN_PARAMETERS.temperature2m.parameterName);
        const rain = raw(ALADIN_PARAMETERS.precipitation1h.parameterName);
        if (Number.isNaN(kelvin) || Number.isNaN(rain)) {
            return undefined;
        }
        if (rain > BBQ_RULES.maxPrecipitationMm) {
            return {good: false, text: "Rain: the fire won't light"};
        }
        if (kelvin < BBQ_RULES.minTemperatureK) {
            return {good: false, text: "Dry, but too cold to sit outside"};
        }
        return {good: true, text: "Grill weather"};
    });

    private readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>("mapContainer");
    private readonly popup = viewChild.required<ElementRef<HTMLDivElement>>("popup");
    private readonly edrApiService = inject(EdrApiService);
    private map?: OlMap;

    constructor() {
        this.mapLayersHelper = new MapLayersHelperService();
        // Create the map only once the container element is in the DOM and has a size.
        afterNextRender(() => {
            this.map = this.createMap(this.mapContainer().nativeElement);
            this.mapLayersHelper.listenForLoadErrors(this.map);
            this.mapLayersHelper.collectLegends(this.map);
            this.mapLayersHelper.collectAvailableTimes(this.map);
            this.mapLayersHelper.listenForClicks(this.map, this.popup().nativeElement, () =>
                this.selectedTime()
            );
        });
        // The renderers notice the new time in their next frame and fetch it.
        effect(() => {
            const time = this.selectedTime();
            // Untracked: updating the popup reads and writes its own state, which must not re-run
            // this effect.
            untracked(() => {
                this.map?.render();
                this.mapLayersHelper.updatePointInfo(time);
            });
        });
    }

    private createMap(target: HTMLElement): OlMap {
        // Centred on Slovakia, then zoomed so the whole model area fills the screen.
        const view = new View({center: fromLonLat([19.7, 48.7]), zoom: 7});
        const map = new OlMap({target, layers: this.createLayers(), view});
        view.fit(transformExtent(ALADIN_SLOVAKIA.domain, "EPSG:4326", view.getProjection()), {
            padding: [90, 40, 150, 40],
        });
        return map;
    }

    /** Layers are rendered bottom to top, in array order. */
    private createLayers(): BaseLayer[] {
        const time = this.selectedTime.asReadonly();
        return [
            // Greyed out in styles.css, so the weather colours stand out against it.
            new TileLayer({source: new OSM(), className: "base-map"}),
            new BitmapLayer({
                source: new EdrGridSource(this.edrApiService, ALADIN_PARAMETERS.temperature2m, time),
                gradient: TEMPERATURE_GRADIENT_IN_KELVIN,
                gradientMode: "linear",
                opacity: 0.55,
                legend: {
                    title: "Temperature [°C]",
                    formatValue: kelvin => formatNumber(kelvin - KELVIN_AT_0_CELSIUS),
                },
            }),
            new BitmapLayer({
                source: new EdrGridSource(this.edrApiService, ALADIN_PARAMETERS.precipitation1h, time),
                gradient: PRECIPITATION_GRADIENT_IN_MM,
                gradientMode: "stepped",
                opacity: 0.85,
                legend: {title: "Rain [mm/h]", formatValue: formatNumber},
            }),
        ];
    }

    ngOnDestroy(): void {
        this.map?.setTarget();
    }
}

/** One decimal at most: 4.25 -> "4.3", 10 -> "10", -0.02 -> "0". */
function formatNumber(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** The current hour in the format of EDR times, e.g. `2026-11-18T13:00:00Z`. */
function currentHour(): string {
    const now = new Date();
    now.setUTCMinutes(0, 0, 0);
    return now.toISOString().replace(".000Z", "Z");
}
