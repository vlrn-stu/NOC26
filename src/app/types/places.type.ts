/** A named place the user can jump to. */
export interface Place {
    name: string;
    lon: number;
    lat: number;
    /** Shown as a quick pick in the side panel. */
    quickPick?: boolean;
}
