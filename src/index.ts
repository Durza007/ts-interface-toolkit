import * as fs from "fs";
import * as ts from "typescript";
// TODO: Try to remove this dependency since it has a lot of dependencies of its own.
import { transformNode } from "ts-creator"

import * as validate from "./validation"
import { CustomTransformationContext } from "./transformationContext";


const GENERATED_COMMENT_TAG = "@ts_interface_generated";
const ARGS_TEMPLATE_NAME = "$args";

const printer = ts.createPrinter({
    omitTrailingSemicolon: false,
    removeComments: false
});

export interface Parameter {
    name: string;
    optional?: boolean;
    rest?: boolean;
    type?: string;
}

export interface Method {
    name: string;
    returnType?: string;
    parameters: Parameter;
}

export interface Interface {
    name: string;
    fileName: string;
    members: ts.MethodSignature[];
}

export function cloneNode<T extends ts.Node>(node: T): T {
    let factoryExpression = transformNode(node);
    const factoryCode = printer.printNode(ts.EmitHint.Expression, factoryExpression, node.getSourceFile());
    return eval(factoryCode);
}

function parseCommentsFromNode(node: ts.Node): ts.SynthesizedComment[] | undefined {
    let comments: ts.SynthesizedComment[] | undefined;
    const triviaWidth = node.getLeadingTriviaWidth();
    if (triviaWidth > 0) {
        const trivia = node.getFullText().slice(0, triviaWidth);
        const commentRanges = ts.getLeadingCommentRanges(trivia, 0);
        if (commentRanges && commentRanges.length > 0) {
            comments = [];
            for (const c of commentRanges) {
                const suffix = c.kind === ts.SyntaxKind.SingleLineCommentTrivia ? 0 : 2;

                comments.push({
                    text: trivia.slice(c.pos + 2, c.end - suffix),
                    end: -1,
                    pos: -1,
                    kind: c.kind,
                    hasTrailingNewLine: c.hasTrailingNewLine
                });
            }
        }
    }

    return comments;
}

export function findInterface(sf: ts.SourceFile, interfaceName: string): ts.InterfaceDeclaration | undefined {
    for (const stmt of sf.statements) {
        if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === interfaceName) {
            return stmt;
        }
    }

    return undefined;
}

export function parseInterface(sf: ts.SourceFile, interfaceName: string): Interface | undefined {
    const stmt = findInterface(sf, interfaceName);
    if (!stmt) return undefined;

    if (!stmt.modifiers || !stmt.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        throw new Error("Interface '" + interfaceName + "' is not directly exported");
    }

    // TODO: Parse inheritance?
    let members: ts.MethodSignature[] = stmt.members.filter(ts.isMethodSignature);
    /*for (const m of stmt.members) {
        console.log(ts.SyntaxKind[m.kind]);
        if (ts.isMethodSignature(m)) {
            const methodName = m.name.getText();
            const returnType = m.type ? m.type.getText() : undefined;

            for (const p of m.parameters) {

            }

        }
    }*/
    
    // TODO: Interfaces can be merged...
    return {
        fileName: sf.fileName,
        name: interfaceName,
        members
    };
}

export function transformFile(sf: ts.SourceFile, data: Interface, classes: Set<string>): ts.SourceFile {

    const context = new CustomTransformationContext({
        removeComments: false
    });

    const transformName = `$${data.name}_template`;

    return ts.visitEachChild(sf, (node) => {
        if (ts.isClassDeclaration(node) && node.name && classes.has(node.name.text)) {
            let transformMethod: ts.MethodDeclaration | undefined;
            for (const m of node.members) {
                if (ts.isMethodDeclaration(m) && m.name.getText() === transformName) {
                    transformMethod = m;
                    break;
                }
            }

            if (!transformMethod) {
                console.error("Could not find transform method for class '" + node.name.getText() + "'");
                return node;
            }

            let membersToGenerate = new Map<string, ts.MethodSignature>();
            for (const m of data.members) {
                membersToGenerate.set(m.name.getText(), m);
            }

            let members: ts.ClassElement[] = [];

            for (const m of node.members) {
                if (!ts.isMethodDeclaration(m)) {
                    members.push(m);
                    continue;
                }

                const memberName = m.name.getText();
                if (!membersToGenerate.has(memberName)) {
                    members.push(m);
                    continue;
                }

                // TODO: Check if the user has manually written this function.
                // and if so, do not touch it.
                
                membersToGenerate.delete(memberName);
            }

            const generatedComment: ts.SynthesizedComment = {
                end: -1,
                pos: -1,
                text: "* " + GENERATED_COMMENT_TAG + " ",
                hasTrailingNewLine: true,
                kind: ts.SyntaxKind.MultiLineCommentTrivia
            };

            // All memberNames that are left in the set needs to be generated
            for (const [ memberName, m ] of membersToGenerate) {
                let comments = parseCommentsFromNode(m);
                if (comments) {
                    if (comments.length && comments[comments.length - 1].kind === ts.SyntaxKind.MultiLineCommentTrivia) {
                        comments[comments.length - 1] = {
                            end: -1,
                            pos: -1,
                            text: comments[comments.length - 1].text + "\n * " + GENERATED_COMMENT_TAG + "\n ",
                            hasTrailingNewLine: true,
                            kind: ts.SyntaxKind.MultiLineCommentTrivia
                        };
                    }
                    else {
                        comments.push(generatedComment);
                    }
                }
                else
                    comments = [ generatedComment ];

                const parameters = m.parameters.filter(p => {
                    if (!ts.isIdentifier(p.name)) return false;

                    return p.name.text !== "this";
                });

                const passParameters = parameters.map(p => ts.createIdentifier((p.name as ts.Identifier).text));
                const declParameters = transformMethod.parameters.reduce((params, p) => {
                    if (ts.isIdentifier(p.name) && p.name.text === ARGS_TEMPLATE_NAME) {
                        params.push(...parameters.map(cloneNode));
                    }
                    else {
                        params.push(cloneNode(p));
                    }

                    return params;
                }, [] as ts.ParameterDeclaration[]);
                

                const visitor: ts.Visitor = node => {
                    if (ts.isIdentifier(node)) {
                        if (node.text === transformName) {
                            return ts.createIdentifier(memberName);
                        }
                    }
                    else if (ts.isStringLiteral(node)) {
                        if (node.text === transformName) {
                            return ts.createStringLiteral(memberName);
                        }
                    }
                    else if (ts.isCallExpression(node)) {
                        const index = node.arguments.findIndex(a => ts.isSpreadElement(a) && ts.isIdentifier(a.expression) && a.expression.text === ARGS_TEMPLATE_NAME);
                        if (index !== -1) {
                            const args = node.arguments.slice(0, index)
                                .concat(passParameters)
                                .concat(node.arguments.slice(index + 1));

                            return ts.createCall(
                                node.expression,
                                node.typeArguments,
                                args
                            );
                        }
                    }
                    else if (ts.isObjectLiteralExpression(node)) {
                        const index = node.properties.findIndex(p => ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression) && p.expression.text === ARGS_TEMPLATE_NAME);
                        if (index !== -1) {
                            const props = node.properties.slice(0, index).map(p => ts.visitEachChild(p, visitor, context))
                                .concat(passParameters.map(p => ts.createShorthandPropertyAssignment(p)))
                                .concat(node.properties.slice(index + 1).map(p => ts.visitEachChild(p, visitor, context)));
                            
                            return ts.createObjectLiteral(props);
                        }
                    }
                    return ts.visitEachChild(node, visitor, context);
                }

                const newMethod = ts.createMethod(
                    transformMethod.decorators,
                    undefined,
                    undefined,
                    ts.createIdentifier(memberName),
                    undefined,
                    m.typeParameters ? m.typeParameters.map(cloneNode) : undefined,
                    declParameters,
                    m.type ? cloneNode(m.type) : undefined,
                    ts.visitEachChild(transformMethod.body, visitor, context)
                );

                if (comments) {
                    ts.setSyntheticLeadingComments(newMethod, comments);
                }

                members.push(newMethod);
            }

            return ts.createClassDeclaration(
                node.decorators,
                node.modifiers,
                node.name,
                node.typeParameters,
                node.heritageClauses,
                members
            );
        }

        return node;
    }, context);
}

function generateInterface() {
    const fileName = "test/interface.ts";
    const interfaceName = "Api";
    const fileData = fs.readFileSync(fileName).toString();

    let filesToTransform: { fileName: string, classes: Set<string> }[] = [
        { fileName: "test/client.ts", classes: new Set([ "Client" ]) }
    ];


    const sf = ts.createSourceFile(fileName, fileData, ts.ScriptTarget.Latest, true);
    const result = parseInterface(sf, interfaceName);
    if (!result) {
        throw new Error("Could not find interface named '" + interfaceName + "'.");
    }

    const printer = ts.createPrinter({
        omitTrailingSemicolon: false,
        removeComments: false
    });

    for (const { fileName, classes } of filesToTransform) {
        const fileData = fs.readFileSync(fileName).toString();
        const sf = ts.createSourceFile(fileName, fileData, ts.ScriptTarget.Latest, true);
        const transformedSf = transformFile(sf, result, classes);

        if (sf === transformedSf) {
            console.log(fileName + ": No changes");
        }
        else {
            console.log(fileName + ": '" + printer.printFile(transformedSf) + "'");
        }
    }

    //console.log(JSON.stringify(result, null, 2));
}


function generateValidation() {
    const fileName = "test/interface.ts";
    const interfaceName = "Person";
    const fileData = fs.readFileSync(fileName).toString();

    const sf = ts.createSourceFile(fileName, fileData, ts.ScriptTarget.Latest, true);
    const result = findInterface(sf, interfaceName);
    if (!result) {
        throw new Error("Could not find interface named '" + interfaceName + "'.");
    }

    const printer = ts.createPrinter({
        omitTrailingSemicolon: false,
        removeComments: false,
    });

    const func = validate.generateValidationFunction(interfaceName, result.members);

    sf.statements = ts.createNodeArray([ func ]);

    const text = printer.printNode(ts.EmitHint.SourceFile, sf, sf);
    console.log(text);

    //console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    //generateInterface();
    generateValidation();
}