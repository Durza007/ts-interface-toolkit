import * as ts from "typescript"

export class CustomTransformationContext implements ts.TransformationContext {
    private lexicalEnvironmentSuspended: boolean = false;
    private lexicalEnvironmentVariables: any[] | undefined;
    private lexicalEnvironmentFunctions: any[] | undefined;
    private lexicalEnvironmentStackOffset: number = 0;
    private lexicalEnvironmentVariableStack: any[] = [];
    private lexicalEnvironmentFunctionStack: any[] = [];
    private emitHelpers: ts.EmitHelper[] | undefined = [];

    constructor(private compilerOptions: ts.CompilerOptions) {

    }

    getCompilerOptions(): ts.CompilerOptions {
        return this.compilerOptions;
    }
    startLexicalEnvironment(): void {
        if (this.lexicalEnvironmentSuspended) {
            throw new Error("Lexical environment is suspended");
        }

        this.lexicalEnvironmentVariableStack[this.lexicalEnvironmentStackOffset] = this.lexicalEnvironmentVariables;
        this.lexicalEnvironmentFunctionStack[this.lexicalEnvironmentStackOffset] = this.lexicalEnvironmentFunctions;
        this.lexicalEnvironmentStackOffset++;
        this.lexicalEnvironmentVariables = undefined;
        this.lexicalEnvironmentFunctions = undefined;
    }
    suspendLexicalEnvironment(): void {
        this.lexicalEnvironmentSuspended = true;
    }
    resumeLexicalEnvironment(): void {
        this.lexicalEnvironmentSuspended = false;
    }
    endLexicalEnvironment(): ts.Statement[] | undefined {
        if (this.lexicalEnvironmentSuspended) {
            throw new Error("Lexical environment is suspended");
        }

        let statements: ts.Statement[] | undefined;
        if (this.lexicalEnvironmentVariables || this.lexicalEnvironmentFunctions) {
            if (this.lexicalEnvironmentFunctions) {
                statements = this.lexicalEnvironmentFunctions.slice();
            }
            if (this.lexicalEnvironmentVariables) {
                const statement = ts.createVariableStatement(undefined, ts.createVariableDeclarationList(this.lexicalEnvironmentVariables));
                if (!statements) {
                    statements = [statement];
                }
                else {
                    statements.push(statement);
                }
            }
        }
        // Restore the previous lexical environment.
        this.lexicalEnvironmentStackOffset--;
        this.lexicalEnvironmentVariables =  this.lexicalEnvironmentVariableStack[this.lexicalEnvironmentStackOffset];
        this.lexicalEnvironmentFunctions =  this.lexicalEnvironmentFunctionStack[this.lexicalEnvironmentStackOffset];
        if (this.lexicalEnvironmentStackOffset === 0) {
            this.lexicalEnvironmentVariableStack = [];
            this.lexicalEnvironmentFunctionStack = [];
        }
        return statements;
    }
    hoistFunctionDeclaration(func: ts.FunctionDeclaration): void {
        if (!this.lexicalEnvironmentFunctions) {
            this.lexicalEnvironmentFunctions = [func];
        }
        else {
            this.lexicalEnvironmentFunctions.push(func);
        }
    }
    hoistVariableDeclaration(name: ts.Identifier): void {
        var decl = ts.setEmitFlags(ts.createVariableDeclaration(name), 64 /* NoNestedSourceMaps */);
        if (!this.lexicalEnvironmentVariables) {
            this.lexicalEnvironmentVariables = [decl];
        }
        else {
            this.lexicalEnvironmentVariables.push(decl);
        }
    }
    requestEmitHelper(helper: ts.EmitHelper): void {
        if (!this.emitHelpers) {
            this.emitHelpers = [ helper ];
        }
        else {
            this.emitHelpers.push(helper);
        }
    }
    readEmitHelpers(): ts.EmitHelper[] | undefined {
        return this.emitHelpers;
    }
    enableSubstitution(kind: ts.SyntaxKind): void {
        console.log("enableSubstitution: " + ts.SyntaxKind[kind]);
    }
    isSubstitutionEnabled(node: ts.Node): boolean {
        return true;
    }
    onSubstituteNode(hint: ts.EmitHint, node: ts.Node): ts.Node {
        return node;
    }
    enableEmitNotification(kind: ts.SyntaxKind): void {
        console.log("enableEmitNotification: " + ts.SyntaxKind[kind]);
    }
    isEmitNotificationEnabled(node: ts.Node): boolean {
        return false;
    }
    onEmitNode(hint: ts.EmitHint, node: ts.Node, emitCallback: (hint: ts.EmitHint, node: ts.Node) => void): void {
        emitCallback(hint, node);
    }
}