export interface Package {
    /** A unique identifier for the pakcage. */
    id: string;

    /** Package name. */
    name: string;

    /** Package version. */
    version: string | null;

    /** Whether this is an in-repo package or not. */
    isInRepo: boolean;
}

export interface Dependency {
    /** Id of the package which has the dependency. */
    from: string;

    /** Id of the package being depended on. */
    to: string;
}
