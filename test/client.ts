import { Api } from "./interface";

// Example connection
export interface Connection {
    handle: number;

    // bla bla
    send<T>(name: string, ...args: any[]): Promise<T>;
}

export class Client implements Api {
    connection: Connection;

    private $Api_template(...$args) {
        if (!this.connection) {
            return Promise.reject(new Error("Not connected"));
        }

        return this.connection.send("$Api_template", { ...$args });
    }

}