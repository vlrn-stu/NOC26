import {DatePipe} from "@angular/common";
import {Component, OnDestroy, computed, input, model, signal} from "@angular/core";

/** Delay between two hours while playing. */
const PLAY_STEP_MS = 900;

/** Lets the user step through the forecast hour by hour, by dragging, buttons or playing. */
@Component({
    selector: "app-time-slider",
    templateUrl: "./time-slider.html",
    styleUrl: "./time-slider.css",
    imports: [DatePipe],
    host: {"(window:keydown)": "onKey($event)"},
})
export class TimeSliderComponent implements OnDestroy {
    /** ISO 8601 times to choose from, sorted. */
    readonly times = input.required<string[]>();
    readonly selectedTime = model.required<string>();

    protected readonly index = computed(() => Math.max(0, this.times().indexOf(this.selectedTime())));
    protected readonly playing = signal(false);
    /** First hour of every local day, to mark day boundaries under the slider. */
    protected readonly days = computed(() => {
        const times = this.times();
        const last = Math.max(1, times.length - 1);
        return times
            .map((time, index) => ({time, index, date: new Date(time)}))
            .filter(({date}, index) => index === 0 || date.getHours() === 0)
            .map(({time, index}) => ({time, left: (index / last) * 100}));
    });

    private timer?: ReturnType<typeof setInterval>;

    protected select(index: number): void {
        const times = this.times();
        if (times.length === 0) {
            return;
        }
        this.selectedTime.set(times[Math.min(Math.max(index, 0), times.length - 1)]);
    }

    protected step(delta: number): void {
        this.select(this.index() + delta);
    }

    protected togglePlay(): void {
        if (this.playing()) {
            this.stop();
            return;
        }
        if (this.index() >= this.times().length - 1) {
            this.select(0);
        }
        this.playing.set(true);
        this.timer = setInterval(() => {
            if (this.index() >= this.times().length - 1) {
                this.stop();
            } else {
                this.step(1);
            }
        }, PLAY_STEP_MS);
    }

    protected onKey(event: KeyboardEvent): void {
        if (event.target instanceof HTMLInputElement && event.target.type !== "range") {
            return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            if (!(event.target instanceof HTMLInputElement)) {
                this.step(event.key === "ArrowRight" ? 1 : -1);
            }
        } else if (event.key === " ") {
            event.preventDefault();
            this.togglePlay();
        }
    }

    private stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
        this.playing.set(false);
    }

    ngOnDestroy(): void {
        this.stop();
    }
}
