import { createState } from '@hookstate/core';
import { Dictionary } from './interfaces';

/**
 * An option for render the graph every time the provenance data is updated
 */
export const renderOnUpdate = createState(false);

/**
 * State for render imports option
 */
export const renderImports = createState(false);

/**
 * State for zoom on select option
 */
export const zoomOnSelect = createState(false);

/**
 * State for only showing the last execute option
 */
export const showLastExecute = createState(false);

/**
 * Slider values
 */
export const sliderValues: Dictionary<any> = createState({});
var cyInstances = {};

/**
 * State for storing the currently displayed executions in a graph
 */
export const displayedExecutions: Dictionary<any> = createState({});

/**
 * Set cytoscape instances
 */
export function cyInstancesGet(): Dictionary<any> {
  return cyInstances;
}

/**
 * Get cytoscape instances
 */
export function cyInstancesSet(input: any): void {
  cyInstances = input;
}

var rendermimeInstance = {};

/**
 * Set cytoscape instances
 */
export function rendermimeInstanceGet(): any {
  return rendermimeInstance;
}

/**
 * Get cytoscape instances
 */
export function rendermimeInstanceSet(input: any): void {
  rendermimeInstance = input;
}
