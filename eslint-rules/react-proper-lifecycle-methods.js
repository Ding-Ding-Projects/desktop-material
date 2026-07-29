// @ts-check

/**
 * react-proper-lifecycle-methods
 *
 * This custom eslint rule is attempts to prevent erroneous usage of the React
 * lifecycle methods by ensuring proper method naming, and parameter order,
 * types and names.
 *
 */

/**
 * @typedef {import('@typescript-eslint/experimental-utils').TSESTree.ClassDeclaration} ClassDeclaration
 * @typedef {import('@typescript-eslint/experimental-utils').TSESTree.ClassExpression} ClassExpression
 * @typedef {ClassDeclaration | ClassExpression} ClassLike
 * @typedef {import('@typescript-eslint/experimental-utils').TSESTree.Node} Node
 * @typedef {import('@typescript-eslint/experimental-utils').TSESTree.Parameter} Parameter
 * @typedef {import("@typescript-eslint/experimental-utils").TSESTree.MethodDefinition} MethodDefinition
 * @typedef {import('@typescript-eslint/experimental-utils').TSESLint.RuleModule} RuleModule
 */

/**
 * Read React component type arguments across TypeScript ESLint AST versions.
 *
 * TypeScript ESLint 8 renamed `superTypeParameters` to `superTypeArguments`.
 * Keep accepting the legacy property because this repository still has tools
 * that consume the older AST shape.
 *
 * @param {ClassLike} node
 *
 * @returns {any|null}
 */
function getSuperTypeArguments(node) {
  const compatibleNode = /** @type {any} */ (node)
  return (
    compatibleNode.superTypeArguments ??
    compatibleNode.superTypeParameters ??
    null
  )
}

/**
 * Extract the props type from the class declaration
 *
 * @param {ClassLike} node
 *
 * @returns {string|null} a `string` if the props type can be resolved, `null` otherwise
 */
function getPropsType(node) {
  const superTypeArguments = getSuperTypeArguments(node)
  if (!superTypeArguments) {
    return null
  }

  if (superTypeArguments.params.length <= 0) {
    return null
  }

  const propsParam = superTypeArguments.params[0]
  if (
    propsParam.type === 'TSTypeReference' &&
    propsParam.typeName.type === 'Identifier'
  ) {
    return propsParam.typeName.name
  }

  if (propsParam.type === 'TSTypeLiteral' && propsParam.members.length === 0) {
    // TODO:
    // if types are inlined, this needs to do that traversal so we can perform equivalence
    // skipping this for now as I'm not aware of usages of this in desktop/desktop
    return '{}'
  }

  return null
}

/**
 * Extract the state type from the class declaration
 *
 * @param {ClassLike} node
 * @param {(node: Node) => string} getText
 *
 * @returns {string|null} a `string` if the props type can be resolved, `null` otherwise
 */
function getStateType(node, getText) {
  const superTypeArguments = getSuperTypeArguments(node)
  if (!superTypeArguments || superTypeArguments.params.length <= 1) {
    return null
  }

  const propsParam = superTypeArguments.params[1]
  if (
    propsParam.type === 'TSTypeReference' &&
    propsParam.typeName.type === 'Identifier'
  ) {
    return propsParam.typeName.name
  }

  if (propsParam.type === 'TSTypeLiteral') {
    return getText(propsParam)
  }

  return null
}

/**
 * Check if the encountered class subclasses React.Component or React.PureComponent
 *
 * @param {ClassLike} node
 *
 * @returns {boolean} `true` if the superclass matches React.Component or React.PureComponent, or `false` in all other cases
 */
function extendsReactComponent(node) {
  if (!node.superClass) {
    return false
  }

  if (node.superClass.type !== 'MemberExpression') {
    return false
  }

  if (node.superClass.object.type !== 'Identifier') {
    return false
  }

  const name = node.superClass.object.name
  if (name !== 'React') {
    return false
  }

  if (node.superClass.type !== 'MemberExpression') {
    return false
  }

  if (node.superClass.property.type !== 'Identifier') {
    return false
  }

  const innerName = node.superClass.property.name
  if (innerName === 'Component' || innerName === 'PureComponent') {
    return true
  }

  return false
}

/**
 * Extract the parameter name from a node in the AST
 *
 * @param {Parameter} node
 *
 * @returns {string} if the name can be resolved, or raised an error if it encounters a node type it doesn't recognize
 */

function getParameterName(node) {
  if (node.type === 'Identifier') {
    return node.name
  }

  throw new Error(
    `getParameterName could not extract a name from a parameter of type ${node.type} `
  )
}

/**
 * Extract the parameter type from a node in the AST
 *
 * @param {Parameter} node
 *
 * @returns {string} if the type can be resolved, or raised an error if it encounters a node type it doesn't recognize
 */
function getParameterType(node) {
  if (node.type !== 'Identifier') {
    throw new Error(
      `getParameterType could not handle parameter of type ${node.type} - this rule needs to be updated`
    )
  }

  if (node.typeAnnotation && node.typeAnnotation.type === 'TSTypeAnnotation') {
    const innerType = node.typeAnnotation.typeAnnotation

    if (innerType.type === 'TSStringKeyword') {
      return 'string'
    } else if (
      innerType.type === 'TSTypeReference' &&
      innerType.typeName.type === 'Identifier'
    ) {
      return innerType.typeName.name
    } else if (
      innerType.type === 'TSTypeLiteral' &&
      innerType.members.length === 0
    ) {
      // TODO:
      // if types are inlined, this needs to do that traversal so we can perform equivalence
      // skipping this for now as I'm not aware of usages of this in desktop/desktop
      return '{}'
    }
  }

  const typeAnnotation = node.typeAnnotation
    ? node.typeAnnotation.type
    : '(undefined)'

  throw new Error(
    `getParameterType could not handle parameter ${node.name} with type annotation ${typeAnnotation} - this rule needs to be updated`
  )
}

/** @type {RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    messages: {
      emptyParametersExpected: `{{ methodName }} should not accept any parameters`,
      unknownParameter: `{{ methodName }} has unknown parameter {{ parameterName }}`,
      nameMismatch: `{{ methodName }} has parameter {{ parameterName }} which does not match expected name {{ expectedName }}`,
      typeMismatch: `{{ methodName }} has parameter {{ parameterName }} which does not match expected type {{ expectedType }}`,
      reservedMethodName: `Method name {{ methodName }} is prohibited as names starting with 'component' or 'shouldComponent' can be confused with React lifecycle methods`,
    },
    fixable: 'code',
    schema: [], // no options
  },
  create: function (context) {
    const filename = context.getFilename()
    if (filename.toLowerCase().endsWith('ts')) {
      return {}
    }

    const sourceFile = context.getSourceCode()
    /** @param {Node} node */
    function getText(node) {
      return sourceFile.getText(node)
    }

    /**
     * Verify the provided parameter matches the expected name and type from the React API
     *
     * @param {string} methodName
     * @param {Parameter} node
     * @param {{ name: string, type: string }} expectedParameter
     *
     * @returns {boolean} false if a problem is reported, or true if no issues found with given parameter
     */
    function verifyParameter(methodName, node, expectedParameter) {
      const parameterName = getParameterName(node)

      let isValid = true

      if (parameterName !== expectedParameter.name) {
        context.report({
          node,
          messageId: 'nameMismatch',
          data: {
            methodName,
            parameterName,
            expectedName: expectedParameter.name,
          },
        })
        isValid = false
      }

      const parameterTypeName = getParameterType(node)

      if (parameterTypeName !== expectedParameter.type) {
        context.report({
          node,
          messageId: 'typeMismatch',
          data: {
            methodName,
            parameterName,
            expectedType: expectedParameter.type,
          },
        })
        isValid = false
      }

      return isValid
    }

    /**
     *
     * @param {string} methodName
     * @param {MethodDefinition} node
     * @param {Array<{name:string,type:string}>} expectedParameters
     * @returns
     */
    function verifyParameters(methodName, node, expectedParameters) {
      // It's okay to omit parameters
      for (let i = 0; i < node.value.params.length; i++) {
        const parameter = node.value.params[i]

        if (i >= expectedParameters.length) {
          const parameterName = getParameterName(parameter)
          context.report({
            node,
            messageId: 'unknownParameter',
            data: {
              methodName,
              parameterName,
            },
          })
          return
        }

        if (!verifyParameter(methodName, parameter, expectedParameters[i])) {
          return
        }
      }
    }

    /** @type {Array<{ propsTypeName: string, stateTypeName: string } | null>} */
    const classContexts = []

    /** @param {ClassLike} node */
    function enterClass(node) {
      if (!extendsReactComponent(node)) {
        classContexts.push(null)
        return
      }

      classContexts.push({
        propsTypeName: getPropsType(node) ?? '{}',
        stateTypeName: getStateType(node, getText) ?? '{}',
      })
    }

    function exitClass() {
      classContexts.pop()
    }

    return {
      ClassDeclaration: enterClass,
      'ClassDeclaration:exit': exitClass,
      ClassExpression: enterClass,
      'ClassExpression:exit': exitClass,
      MethodDefinition(node) {
        const classContext = classContexts[classContexts.length - 1]
        if (!classContext) {
          return
        }

        if (node.key.type !== 'Identifier') {
          return
        }

        const methodName = node.key.name
        if (
          methodName.startsWith('component') ||
          methodName.startsWith('shouldComponent')
        ) {
          switch (methodName) {
            case 'componentWillMount':
            case 'componentDidMount':
            case 'componentWillUnmount':
              if (node.value.params.length) {
                context.report({
                  node,
                  messageId: 'emptyParametersExpected',
                  data: {
                    methodName,
                  },
                })
              }
              break
            case 'componentWillReceiveProps':
              return verifyParameters('componentWillReceiveProps', node, [
                { name: 'nextProps', type: classContext.propsTypeName },
              ])
            case 'componentWillUpdate':
              return verifyParameters('componentWillUpdate', node, [
                { name: 'nextProps', type: classContext.propsTypeName },
                { name: 'nextState', type: classContext.stateTypeName },
              ])
            case 'componentDidUpdate':
              return verifyParameters(methodName, node, [
                { name: 'prevProps', type: classContext.propsTypeName },
                { name: 'prevState', type: classContext.stateTypeName },
              ])
            case 'shouldComponentUpdate':
              return verifyParameters('shouldComponentUpdate', node, [
                { name: 'nextProps', type: classContext.propsTypeName },
                { name: 'nextState', type: classContext.stateTypeName },
              ])
            default:
              context.report({
                node,
                messageId: 'reservedMethodName',
                data: {
                  methodName,
                },
              })
          }
        }
      },
    }
  },
}
