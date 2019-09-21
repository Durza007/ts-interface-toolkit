export interface Api {
    /** Gets a value associated with the specified key */
    getValue(key: string): Promise<string>;

    // Sets a value in the map with the specified key
    setValue(key: string, value: string): Promise<void>;

}

export interface Person {
    name: string;
    age: number;
    occupation?: string;
    hasJob: boolean;
    titles: string[];
    jobs: {
        company: string;
        title: string;
    }[];

    family: {
        mom: Person;
        dad: Person;
    };
    money: {
        dollars: number;
        euro: number;
        SEK?: number;
    }
}