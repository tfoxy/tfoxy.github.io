/*!
 * na-error-propagation
 * @see https://github.com/tfoxy/na-error-propagation
 * @version 0.1.1
 * @author Tomás Fox <tomas.c.fox@gmail.com>
 * @license MIT
 */

/* global define */

(function(root, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.ErrorPropagation = factory();
  }
}(this, function() {
  'use strict';

  function InputError(message) {
    this.name = 'InputError';
    this.message = message;
  }

  InputError.prototype = Object.create(Error.prototype);
  InputError.prototype.constructor = InputError;

  function ErrorPropagation(options) {
    options = options || {};

    switch (options.correlation) {
      case undefined:
      case 'correlated':
        this._calculateError = calculateCorrelatedError;
        break;
      case 'uncorrelated':
        this._calculateError = calculateUncorrelatedError;
        break;
      case 'both':
        this._calculateError = calculateBothErrors;
        break;
      default:
        throw new InputError(
            'Wrong value for correlation: ' + options.correlation +
            '. It must be one of correlated, uncorrelated and both'
        );
    }
  }

  ErrorPropagation.InputError = InputError;
  ErrorPropagation.nerdamer = nerdamerNotSet;
  ErrorPropagation.setEventEmitter = setEventEmitter;

  ErrorPropagation.setEventEmitter(getEventEmitter());

  return ErrorPropagation;

  ////////////////

  function nerdamerNotSet() {
    throw new Error('ErrorPropagation.nerdamer must be set');
  }

  function setEventEmitter(EventEmitter) {
    ErrorPropagation.prototype = Object.create(EventEmitter.prototype);
    ErrorPropagation.prototype.constructor = ErrorPropagation;

    ErrorPropagation.prototype.calculate = calculate;
  }

  function calculate(expression, variables) {
    this.emit('input', expression, variables);

    if (typeof expression !== 'string') {
      throw new InputError('expression must be a string. Got ' + typeof expression);
    }

    variables = variables || {};

    var valueMap = getValueMap(variables);
    var value = calculateValue(expression, valueMap);
    var error = this._calculateError(expression, variables, valueMap, this);
    var result = {
      value: value,
      error: error
    };

    this.emit('result', result);

    return result;
  }

  function calculateValue(expression, valueMap, expressionStorage) {
    var e = ErrorPropagation.nerdamer(expression);
    ErrorPropagation.nerdamer.clear('last');
    if (expressionStorage) {
      expressionStorage.e = e;
    }
    return e.evaluate(valueMap).valueOf();
  }

  function calculateErrors(expression, variables, valueMap, emitter) {
    var errors = [];

    for (var variableName in variables) {
      var variable = variables[variableName];
      if (variable.error) {
        var expressionStorage = {};
        var diffExpression = 'diff(' + expression + ',' + variableName + ')';
        var evaluatedDiffValue = calculateValue(diffExpression, valueMap, expressionStorage);
        var variableError = evaluatedDiffValue * variable.error;
        emitter.emit('differential', {
          value: evaluatedDiffValue,
          variableName: variableName,
          variable: variable,
          valueWithError: variableError,
          expression: expressionStorage.e
        });
        errors.push(variableError);
      }
    }

    return errors;
  }

  function calculateCorrelatedError(expression, variables, valueMap, emitter) {
    var error = 0;
    var errors = calculateErrors(expression, variables, valueMap, emitter);
    errors.forEach(function(variableError) {
      error += variableError;
    });
    return error;
  }

  function calculateUncorrelatedError(expression, variables, valueMap, emitter) {
    var error = 0;
    var errors = calculateErrors(expression, variables, valueMap, emitter);
    errors.forEach(function(variableError) {
      error += Math.pow(variableError, 2);
    });
    return Math.sqrt(error);
  }

  function calculateBothErrors(expression, variables, valueMap, emitter) {
    var correlatedError = 0;
    var uncorrelatedError = 0;

    var errors = calculateErrors(expression, variables, valueMap, emitter);
    errors.forEach(function(variableError) {
      correlatedError += variableError;
      uncorrelatedError += Math.pow(variableError, 2);
    });

    return {
      correlated: correlatedError,
      uncorrelated: Math.sqrt(uncorrelatedError)
    };
  }

  function getValueMap(variables) {
    var map = {};

    for (var variableName in variables) {
      var variable = variables[variableName];
      verifyVariable(variable, variableName);
      map[variableName] = variable.value;
    }

    return map;
  }

  function verifyVariable(variable, variableName) {
    if (typeof variable !== 'object') {
      throw new InputError('Variable ' + variableName + ' is not an object.' +
          ' Got ' + typeof variable);
    }
    if (variable === null) {
      throw new InputError('Variable ' + variableName + ' must not be null');
    }
    if (!('value' in variable)) {
      throw new InputError('No value for variable ' + variableName);
    }
  }

  function getEventEmitter() {
    var EventEmitter = {
      prototype: {
        on: function() {
          throw new Error('An EventEmitter library needs to be set using' +
              ' HermiteInterpolation.setEventEmitter(EventEmitter) method.' +
              ' The /on/ function cannot be used otherwise');
        },
        emit: function() {}
      }
    };

    if (typeof module === 'object' && module.exports) {
      try {
        EventEmitter = require('events').EventEmitter;
      } catch (err) {
        // noop
      }
    }

    return EventEmitter;
  }

}));
