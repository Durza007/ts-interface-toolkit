import * as ts from "typescript";

function reportError(interfaceName: string, message: string): never {
    throw new Error("Interface '" + interfaceName + "' " + message);
}

function createAllTrueExpression(...expressions: (ts.Expression | undefined)[]): ts.Expression | undefined {
    if (expressions.length === 0) return undefined;

    let result = expressions[0];
    for (let i = 1; i < expressions.length; i++) {
        const expr = expressions[i];
        if (!expr) continue;

        if (result) {
            result = ts.createBinary(
                result,
                ts.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                expr
            );
        }
        else {
            result = expr;
        }

    }

    return result;
}

function createTypeCheck(access: ts.Expression, type: ts.TypeNode): ts.Expression | ts.Statement[] | undefined {
    switch (type.kind) {
        case ts.SyntaxKind.BooleanKeyword:
            return ts.createBinary(
                ts.createTypeOf(access),
                ts.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                ts.createStringLiteral("boolean")
            );

        case ts.SyntaxKind.StringKeyword:
            return ts.createBinary(
                ts.createTypeOf(access),
                ts.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                ts.createStringLiteral("string")
            );

        case ts.SyntaxKind.NumberKeyword:
            return ts.createBinary(
                ts.createTypeOf(access),
                ts.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
                ts.createStringLiteral("number")
            );
        case ts.SyntaxKind.ArrayType:
            const innerVarIdent = ts.createIdentifier("v");
            const arrayCheck = ts.createBinary(
                access,
                ts.createToken(ts.SyntaxKind.InstanceOfKeyword),
                ts.createIdentifier("Array")
            );

            const arrayTypeCheck = createTypeCheck(innerVarIdent, (type as ts.ArrayTypeNode).elementType);
            if (arrayTypeCheck) {
                return ts.createBinary(
                    arrayCheck,
                    ts.createToken(ts.SyntaxKind.AmpersandAmpersandToken),
                    ts.createCall(
                        ts.createPropertyAccess(
                            access,
                            ts.createIdentifier("every")
                        ),
                        undefined,
                        [
                            ts.createArrowFunction(
                                undefined,
                                undefined,
                                [
                                    ts.createParameter(
                                        undefined,
                                        undefined,
                                        undefined,
                                        innerVarIdent,
                                        undefined,
                                        undefined,
                                        undefined
                                    )
                                ],
                                undefined,
                                ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                                arrayTypeCheck instanceof Array ?
                                    ts.createBlock(
                                        [
                                            ...arrayTypeCheck,
                                            ts.createReturn(ts.createTrue())
                                        ],
                                        true
                                    ) :
                                    arrayTypeCheck
                            )
                        ]
                    )
                );
            }
            else {
                return arrayCheck;
            }
        
        case ts.SyntaxKind.TypeLiteral:
            const statements: ts.Statement[] = [];

            let objectRef: ts.Expression;
            if (access.kind === ts.SyntaxKind.Identifier) {
                objectRef = access;
            }
            else {
                objectRef = ts.createIdentifier("v");
                statements.push(
                    ts.createVariableStatement(
                        undefined,
                        ts.createVariableDeclarationList(
                            [
                                ts.createVariableDeclaration(
                                    ts.createIdentifier("v"),
                                    undefined,
                                    access
                                )
                            ],
                            ts.NodeFlags.Const
                        )
                    )
                );
            }

            const members = (type as ts.TypeLiteralNode).members;
            for (const member of members) {
                statements.push(...createTypeCheckForMember("inner", objectRef, member))
            }

            return statements;

        default:
            return undefined;
    }
}


function createTypeCheckForMember(interfaceName: string, objectRef: ts.Expression, member: ts.TypeElement): ts.Statement[] {
    let statements: ts.Statement[] = [];

    const name = member.name;
    if (!name) {
        reportError(interfaceName, "has member that lacks a name?");
        return statements;
    }
    if (name.kind === ts.SyntaxKind.ComputedPropertyName) {
        reportError(interfaceName, "has member with computerPropertyName which is not supported.");
        return statements;
    }

    const access = ts.createPropertyAccess(
        objectRef,
        ts.createIdentifier(name.text)
    );

    if (ts.isPropertySignature(member)) {
        if (!member.type) return statements;
        
        let typeCheck = createTypeCheck(access, member.type);
        if (!typeCheck) return statements;

        if (typeCheck instanceof Array) {
            if (member.questionToken) {
                statements.push(
                    ts.createIf(
                        ts.createBinary(
                            ts.createStringLiteral(name.text),
                            ts.createToken(ts.SyntaxKind.InKeyword),
                            objectRef
                        ),
                        ts.createBlock(typeCheck)
                    )
                )
            }
            else {
                statements.push(ts.createBlock(typeCheck));
            }
        }
        else {
            if (member.questionToken) {
                typeCheck = ts.createBinary(
                    ts.createPrefix(
                        ts.SyntaxKind.ExclamationToken,
                        ts.createParen(
                            ts.createBinary(
                                ts.createStringLiteral(name.text),
                                ts.createToken(ts.SyntaxKind.InKeyword),
                                objectRef
                            )
                        )
                    ),
                    ts.createToken(ts.SyntaxKind.BarBarToken),
                    typeCheck
                );
            }
            statements.push(
                ts.createIf(
                    ts.createPrefix(
                        ts.SyntaxKind.ExclamationToken,
                        ts.createParen(typeCheck)
                    ),
                    ts.createReturn(ts.createFalse()),
                    undefined
                )
            );
        }
    }

    return statements;
}

export function generateValidationFunction(interfaceName: string, members: ts.NodeArray<ts.TypeElement>): ts.FunctionDeclaration {
    const paramName = "value";
    const valueName = ts.createIdentifier(paramName);

    let statements: ts.Statement[] = [];

    // Start by making sure the value is an object.
    statements.push(
        ts.createIf(
            ts.createBinary(
                ts.createTypeOf(valueName),
                ts.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                ts.createStringLiteral("object")
            ),
            ts.createReturn(ts.createFalse()),
            undefined
        )
    );

    for (const member of members) {
        statements.push(...createTypeCheckForMember(interfaceName, valueName, member))
    }

    statements.push(ts.createReturn(ts.createTrue()));

    const upperCaseFirst = interfaceName[0].toUpperCase() + interfaceName.slice(1);

    return ts.createFunctionDeclaration(
        undefined,
        undefined,
        undefined,
        "is" + upperCaseFirst,
        undefined,
        [
            ts.createParameter(
                undefined,
                undefined,
                undefined,
                paramName,
                undefined,
                ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
            )
        ],
        ts.createTypePredicateNode(
            ts.createIdentifier(paramName),
            ts.createTypeReferenceNode(
              ts.createIdentifier(interfaceName),
              undefined
            )
        ),
        ts.createBlock(
            statements,
            true
        )
    );
}