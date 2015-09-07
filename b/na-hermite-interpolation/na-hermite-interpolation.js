/*!
 * na-hermite-interpolation v0.4.0
 * https://github.com/tfoxy/na-hermite-interpolation
 *
 * Copyright 2015 Tomás Fox
 * Released under the MIT license
 */

/**
 * Numbers must have the following methods for the divided differences:
 * cmp, minus, div
 * Additionally, to calculate the polynomial coefficients:
 * plus, times, neg
 * For differentials of order 2 or more, division must support javascript numbers
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.HermiteInterpolation = factory();
  }
}(this, function() {
  'use strict';

  function DuplicateError(duplicateValue, firstIndex, secondIndex) {
    this.name = 'DuplicateError';
    this.message = 'Duplicate value at x' + firstIndex +
        ' and x' + secondIndex +
        '. Value: ' + duplicateValue;

    this.duplicateValue = duplicateValue;
    this.firstIndex = firstIndex;
    this.secondIndex = secondIndex;
  }
  DuplicateError.prototype = Object.create(Error.prototype);
  DuplicateError.prototype.constructor = DuplicateError;


  function HermiteInterpolation() {
    this.data = [];
    this._column = [];
    this._prevColumn = [];
    this._data = [];
    this._currentFactorialResult = 1;
    this._currentFactorialFactor = 1;
  }

  HermiteInterpolation._dataCompareFn = function(left, right) {
    return left.x.cmp(right.x);
  };

  HermiteInterpolation.DuplicateError = DuplicateError;


  HermiteInterpolation.setEventEmitter = setEventEmitter;

  function setEventEmitter(EventEmitter) {

    HermiteInterpolation.prototype = Object.create(EventEmitter.prototype);
    HermiteInterpolation.prototype.constructor = HermiteInterpolation;


    HermiteInterpolation.prototype.calculateDividedDifferences = function() {
      if (this.data.length === 0) {
        return;
      }

      this._prepareData();
      var preCoef = this._calculateDividedDifferences();
      this._cleanUp();

      return preCoef;
    };


    HermiteInterpolation.prototype.calculatePolynomialCoefficients = function() {
      if (this.data.length === 0) {
        return [];
      }

      this._prepareData();

      var preCoef = this._calculateDividedDifferences();

      this.emit('preCoefficients', preCoef);

      return this._calculatePolynomialCoefficients(preCoef);
    };


    HermiteInterpolation.prototype._calculatePolynomialCoefficients = function(preCoef) {
      var coef = preCoef.slice();

      var tempCoef = [];
      // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
      var x_i, fx_0i;

      var timesCoefFn = function(c) {
        return c.times(x_i);
      };

      var addAuxCoefFn = function(auxC, i) {
        tempCoef[i + 1] = tempCoef[i + 1].plus(auxC);
      };

      var addTempCoefFn = function(tempC, i) {
        coef[i] = fx_0i.times(tempC).plus(coef[i]);
      };


      for (var i = 1; i < coef.length; i++) {
        // f(x[0], ..., x[i]) * tempCoef * (x - x[i-1])

        //noinspection JSUnresolvedFunction
        x_i = this._data[i - 1].x.neg();
        fx_0i = preCoef[i];
        var auxCoef = tempCoef;

        tempCoef = auxCoef.map(timesCoefFn);

        tempCoef.push(x_i);

        auxCoef.forEach(addAuxCoefFn);

        tempCoef.forEach(addTempCoefFn);
      }

      this.emit('coefficients', coef);

      this._cleanUp();

      return coef;
    };


    HermiteInterpolation.prototype._prepareData = function() {
      this._checkDuplicateX();
      this._cloneData();
      this._multiplyPointsWithDifferential();
      this._orderDataByX();
      this._initPrevColumn();

      this.emit('dataInitialized', this._data);
    };


    HermiteInterpolation.prototype._checkDuplicateX = function() {
      var set = Object.create(null);

      this.data.forEach(function(point, i) {
        var x = JSON.stringify(point.x);
        if (x in set) {
          this.emit('error', new DuplicateError(point.x, set[x], i));
        }
        set[x] = i;
      }, this);
    };


    HermiteInterpolation.prototype._cloneData = function() {
      this._data = this.data.map(function(point) {
        var _point = {x: point.x, y: point.y};

        if (!point.d) {
          _point.d = [];
        } else if (!Array.isArray(point.d)) {
          _point.d = [point.d];
        } else {
          _point.d = point.d;
        }

        return _point;
      });
    };


    HermiteInterpolation.prototype._multiplyPointsWithDifferential = function() {
      var length = this._data.length;

      for (var i = 0; i < length; ++i) {
        var point = this._data[i];
        for (var j = 0; j < point.d.length; ++j) {
          this._data.push(point);
        }
      }
    };


    HermiteInterpolation.prototype._orderDataByX = function() {
      this._data.sort(HermiteInterpolation._dataCompareFn);
    };


    HermiteInterpolation.prototype._initPrevColumn = function() {
      this._data.forEach(function(point) {
        this._prevColumn.push(point.y);
      }, this);
    };


    HermiteInterpolation.prototype._calculateDividedDifferences = function() {
      var preCoef = [this._data[0].y];

      for (var j = 1; j < this._data.length; j++) {
        preCoef.push(this._calculateStepResult(0, j));
        for (var i = 1; i < this._data.length - j; i++) {
          this._calculateStepResult(i, i + j);
        }
        this._prevColumn = this._column;
        this._column = [];
      }

      this._prevColumn = [];

      return preCoef;
    };


    HermiteInterpolation.prototype._calculateStepResult = function(i, j) {
      var result;
      var xI = this._data[i].x, xJ = this._data[j].x;

      if (xI.cmp(xJ) === 0) {
        result = this._getDifferentialResult(this._data[i], j - i);
      } else {
        var divisor = xJ.minus(xI);
        var dividend = this._prevColumn[i + 1].minus(this._prevColumn[i]);
        result = dividend.div(divisor);
      }

      this._column.push(result);

      this.emit('step', {i: i, j: j, result: result});

      return result;
    };


    HermiteInterpolation.prototype._getDifferentialResult = function(point, order) {
      if (order === 1) {
        return point.d[0];
      } else {
        return point.d[order - 1].div(this._factorial(order));
      }
    };


    HermiteInterpolation.prototype._factorial = function(differentialOrder) {
      if (differentialOrder !== this._currentFactorialFactor) {
        this._currentFactorialResult *= ++this._currentFactorialFactor;
      }

      return this._currentFactorialResult;
    };


    HermiteInterpolation.prototype._cleanUp = function() {
      this._data = [];
      this._currentFactorialResult = 1;
      this._currentFactorialFactor = 1;
    };

  }

  var EventEmitter;
  if (typeof module === 'object' && module.exports) {
    EventEmitter = require('events').EventEmitter;
  } else {
    EventEmitter = {prototype: {on: function(){}}};
  }
  HermiteInterpolation.setEventEmitter(EventEmitter);

  return HermiteInterpolation;
}));
