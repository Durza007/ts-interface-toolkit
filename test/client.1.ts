import { Api } from "./interface";

export interface Connection {
    handle: number;

    send<T>(name: string, ...args: any[]): Promise<T>;
}

export class Client implements Api {
    connection: Connection;

    $Api_template(...$args) {
        if (!this.connection) {
            return Promise.reject(new Error("Not connected"));
        }

        return this.connection.send("$Api_template", ...$args);
    }
}