/** The part of an EDR collection description (`GET {baseUrl}/collections/{id}`) the app reads. */
export interface EdrCollection {
    id: string;
    extent: {
        /** ISO 8601 times the collection has data for. */
        temporal?: {values?: string[]};
    };
}
