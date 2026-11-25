import {Component, ElementRef, OnDestroy, afterNextRender, inject, viewChild} from "@angular/core";
import OlMap from "ol/Map";
import View from "ol/View";
import BaseLayer from "ol/layer/Base";
import TileLayer from "ol/layer/Tile";
import {fromLonLat} from "ol/proj";
import OSM from "ol/source/OSM";
import {TEMPERATURE_GRADIENT_IN_KELVIN} from "../consts/gradients";
import {ALADIN_PARAMETERS} from "../consts/parameters";
import {EdrGridSource} from "../edr/edr-grid-source";
import {EdrApiService} from "../edr/edr-api.service";
import {BitmapLayer} from "../visualizations/bitmap/bitmap-layer";
import {MapLayersHelperService} from "./map-layers-helper.service";

@Component({
    selector: "app-map",
    templateUrl: "./map.html",
    styleUrl: "./map.css",
    providers: [],
})
export class MapComponent implements OnDestroy {
    protected readonly mapLayersHelper: MapLayersHelperService;

    private readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>("mapContainer");
    private readonly edrApiService = inject(EdrApiService);
    private map?: OlMap;

    constructor() {
        this.mapLayersHelper = new MapLayersHelperService();
        // Create the map only once the container element is in the DOM and has a size.
        afterNextRender(() => {
            this.map = this.createMap(this.mapContainer().nativeElement);
            this.mapLayersHelper.listenForLoadErrors(this.map);
        });
    }

    private createMap(target: HTMLElement): OlMap {
        return new OlMap({
            target,
            layers: this.createLayers(),
            // Centred on Slovakia.
            view: new View({center: fromLonLat([19.7, 48.7]), zoom: 7}),
        });
    }

    /** Layers are rendered bottom to top, in array order. */
    private createLayers(): BaseLayer[] {
        return [
            new TileLayer({source: new OSM()}),
            new BitmapLayer({
                source: new EdrGridSource(this.edrApiService, ALADIN_PARAMETERS.temperature2m),
                gradient: TEMPERATURE_GRADIENT_IN_KELVIN,
                gradientMode: "linear",
                opacity: 0.7,
            }),
        ];
    }

    ngOnDestroy(): void {
        this.map?.setTarget();
    }
}
