import {BbqRules} from "../types/bbq.type";
import {Place} from "../types/places.type";

/** What one forecast hour means for a barbecue. */
export type HourRating = "good" | "rain" | "cold" | "unknown";

/** One forecast hour at the chosen place. */
export interface ForecastHour {
    time: string;
    temperatureC: number;
    rainMm: number;
    /** NaN when the map has no wind layer. */
    windMs: number;
    rating: HourRating;
}

/** A run of grill hours: from the start of `start` to the end of `end`. */
export interface GrillWindow {
    start: string;
    end: string;
    hours: number;
}

const KELVIN_AT_0_CELSIUS = 273.15;
const HOUR_MS = 60 * 60 * 1000;

export function rateHour(kelvin: number, rainMm: number, rules: BbqRules): HourRating {
    if (Number.isNaN(kelvin) || Number.isNaN(rainMm)) {
        return "unknown";
    }
    if (rainMm > rules.maxPrecipitationMm) {
        return "rain";
    }
    return kelvin < rules.minTemperatureK ? "cold" : "good";
}

/** Joins the temperature (K) and rain (mm) series into rated hours, in the order of `times`. */
export function forecastHours(
    times: string[],
    temperatureK: Map<string, number>,
    rainMm: Map<string, number>,
    windMs: Map<string, number>,
    rules: BbqRules
): ForecastHour[] {
    return times.map(time => {
        const kelvin = temperatureK.get(time) ?? Number.NaN;
        const rain = rainMm.get(time) ?? Number.NaN;
        return {
            time,
            temperatureC: kelvin - KELVIN_AT_0_CELSIUS,
            rainMm: rain,
            windMs: windMs.get(time) ?? Number.NaN,
            rating: rateHour(kelvin, rain, rules),
        };
    });
}

/**
 * The longest run of grill hours from now on that lies within the rules' local daytime hours;
 * the earliest one wins a tie.
 */
export function bestGrillWindow(hours: ForecastHour[], rules: BbqRules): GrillWindow | undefined {
    const notBefore = Date.now() - HOUR_MS;
    let best: GrillWindow | undefined;
    let run: ForecastHour[] = [];
    const close = (): void => {
        if (run.length > 0 && (!best || run.length > best.hours)) {
            best = {start: run[0].time, end: run[run.length - 1].time, hours: run.length};
        }
        run = [];
    };
    for (const hour of hours) {
        const localHour = new Date(hour.time).getHours();
        const usable =
            hour.rating === "good" &&
            Date.parse(hour.time) >= notBefore &&
            localHour >= rules.earliestHour &&
            localHour < rules.latestHour;
        const previous = run.at(-1);
        const continues = previous && Date.parse(hour.time) - Date.parse(previous.time) === HOUR_MS;
        if (!usable || (previous && !continues)) {
            close();
        }
        if (usable) {
            run.push(hour);
        }
    }
    close();
    return best;
}

/**
 * The warmest hour from now on without rain, within the rules' local daytime hours: the least bad
 * time when no hour is warm enough.
 */
export function warmestDryHour(hours: ForecastHour[], rules: BbqRules): ForecastHour | undefined {
    const notBefore = Date.now() - HOUR_MS;
    let warmest: ForecastHour | undefined;
    for (const hour of hours) {
        const localHour = new Date(hour.time).getHours();
        const dry = hour.rating === "good" || hour.rating === "cold";
        const usable =
            dry &&
            Date.parse(hour.time) >= notBefore &&
            localHour >= rules.earliestHour &&
            localHour < rules.latestHour;
        if (usable && (!warmest || hour.temperatureC > warmest.temperatureC)) {
            warmest = hour;
        }
    }
    return warmest;
}

/** "Nitra" within 3 km of a place, "near Nitra" within 25 km, otherwise nothing. */
export function placeName(lon: number, lat: number, places: Place[]): string | undefined {
    let nearest: {place: Place; km: number} | undefined;
    for (const place of places) {
        const km = distanceKm(lon, lat, place.lon, place.lat);
        if (!nearest || km < nearest.km) {
            nearest = {place, km};
        }
    }
    if (!nearest || nearest.km > 25) {
        return undefined;
    }
    return nearest.km <= 3 ? nearest.place.name : `near ${nearest.place.name}`;
}

function distanceKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const rad = Math.PI / 180;
    const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
    const y = (lat2 - lat1) * rad;
    return Math.hypot(x, y) * 6371;
}
