import { JupyterFrontEnd } from '@jupyterlab/application';
import cytoscape from 'cytoscape';
//@ts-ignore
import coseBilkent from 'cytoscape-cose-bilkent';
//@ts-ignore
import cxtmenu from 'cytoscape-cxtmenu';

import { CellData, ProvenanceData } from './interfaces';
import {
  displayedExecutions,
  renderImports,
  renderOnUpdate,
  showLastExecute,
  sliderValues
} from './states';

import { NotebookPanel } from '@jupyterlab/notebook';

// Use the contextmenu for cytoscape
//@ts-ignore
cytoscape.use(cxtmenu);

export function InitCytoscape(id: string, app: JupyterFrontEnd, path: string) {
  // Use the cose bilkent layout algorithm for cytoscape
  cytoscape.use(coseBilkent);

  var cy = cytoscape({
    container: document.getElementById(id),

    // Styles for the graph
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': 16,
          'font-weight': 'bold'
        }
      },
      {
        selector: '.top-center',
        style: {
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': 16,
          'font-weight': 'bold',
          'text-outline-color': '#fff',
          'text-outline-width': 2,
          'text-outline-opacity': 0.8
        }
      },
      {
        selector: 'edge',
        style: {
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier'
        }
      },
      {
        selector: 'edge[label]',
        style: {
          label: 'data(label)',
          //@ts-ignore
          'text-rotation': 'autorotate',
          'text-margin-x': 0,
          'text-margin-y': 0,
          'font-size': 16,
          'font-weight': 'bold',
          'text-outline-color': '#fff',
          'text-outline-width': 2,
          'text-outline-opacity': 0.8
        }
      },
      {
        selector: '.DataSource',
        style: {
          'background-color': 'orange',
          'line-color': 'orange',
          'target-arrow-color': 'orange'
        }
      },
      {
        selector: '.Output',
        style: {
          'background-color': 'green'
        }
      },
      {
        selector: '.DataSourceOutput',
        style: {
          //@ts-ignore
          'background-fill': 'linear-gradient',
          'background-gradient-stop-colors': 'green green orange orange', // get data from data.color in each node
          'background-gradient-stop-positions': '49.8 49.9 50.1 50.2'
        }
      },
      {
        selector: '.DataSourceError',
        style: {
          //@ts-ignore
          'background-fill': 'linear-gradient',
          'background-gradient-stop-colors': 'orange orange red red', // get data from data.color in each node
          'background-gradient-stop-positions': '49.8 49.9 50.1 50.2'
        }
      },
      {
        selector: '.OutputError',
        style: {
          'background-color': 'red'
        }
      },
      {
        selector: '.DataSourceOutputError',
        style: {
          //@ts-ignore
          'background-fill': 'linear-gradient',
          'background-gradient-stop-colors': 'orange orange red red', // get data from data.color in each node
          'background-gradient-stop-positions': '49.8 49.9 50.1 50.2'
        }
      },
      {
        selector: '.Error',
        style: {
          'background-color': 'red'
        }
      },
      {
        selector: '.Deleted',
        style: {
          'background-color': 'red',
          'background-opacity': 0.2
        }
      },
      {
        selector: '.Import',
        style: {
          opacity: 0.6,
          'line-color': '#b3e3ff'
        }
      }
    ]
  });
  let ctxMenu = {
    menuRadius: function (ele: any) {
      return 100;
    }, // the outer radius (node center to the end of the menu) in pixels. It is added to the rendered size of the node. Can either be a number or function as in the example.
    selector: 'node,edge', // elements matching this Cytoscape.js selector will trigger cxtmenus
    commands: (inputEle: any) => {
      if (inputEle.isNode() && inputEle.children().length == 0) {
        return [
          {
            fillColor: 'rgba(200, 200, 200, 0.75)', // optional: custom background color for item
            content: 'Show code differences', // html/text content to be displayed in the menu
            contentStyle: {}, // css key:value pairs to set the command's css in js if you want
            select: function (ele: any) {
              // a function to execute when the command is selected
              app.commands.execute('prov-diff:open', {
                click: true,
                path: path,
                cell_id: ele.data()['parent'],
                execution_count: ele.data()['execution_count'],
                epoch: ele.data()['epoch']
              });
            },
            enabled: true // whether the command is selectable
          },
          {
            fillColor: 'rgba(200, 200, 200, 0.75)', // optional: custom background color for item
            content: 'Show execution info', // html/text content to be displayed in the menu
            contentStyle: {}, // css key:value pairs to set the command's css in js if you want
            select: function (ele: any) {
              // a function to execute when the command is selected
              app.commands.execute('prov-info:open', {
                click: true,
                path: path,
                cell_id: ele.data()['parent'],
                execution_count: ele.data()['execution_count'],
                epoch: ele.data()['epoch']
              });
            },
            enabled: true // whether the command is selectable
          }
        ];
      } else if (
        inputEle.isNode() &&
        inputEle.children().length != 0 &&
        !inputEle.classes().includes('Deleted')
      ) {
        return [
          {
            fillColor: 'rgba(200, 200, 200, 0.75)', // optional: custom background color for item
            content: 'Focus cell in notebook', // html/text content to be displayed in the menu
            contentStyle: {}, // css key:value pairs to set the command's css in js if you want
            select: function (ele: any) {
              // a function to execute when the command is selected
              app.commands.execute('prov-utils:focus-cell', {
                path: path,
                cell_id: ele.data()['id']
              });
            },
            enabled: true // whether the command is selectable
          }
        ];
      } else if (inputEle.isEdge() && !inputEle.classes().includes('Import')) {
        return [
          {
            fillColor: 'rgba(200, 200, 200, 0.75)', // optional: custom background color for item
            content: 'Show execution info', // html/text content to be displayed in the menu
            contentStyle: {}, // css key:value pairs to set the command's css in js if you want
            select: function (ele: any) {
              // a function to execute when the command is selected
              app.commands.execute('prov-info:open', {
                click: true,
                path: path,
                cell_id: ele.data()['source_id'],
                execution_count: ele.data()['execution_count'],
                epoch: ele.data()['epoch'],
                variable: ele.data()['label']
              });
            },
            enabled: true // whether the command is selectable
          }
        ];
      } else {
        return [];
      }
    }, // function( ele ){ return [ /*...*/ ] }, // a function that returns commands or a promise of commands
    fillColor: 'rgba(0, 0, 0, 0.75)', // the background colour of the menu
    activeFillColor: 'rgba(1, 105, 217, 0.75)', // the colour used to indicate the selected command
    activePadding: 20, // additional size in pixels for the active command
    indicatorSize: 24, // the size in pixels of the pointer to the active command, will default to the node size if the node size is smaller than the indicator size,
    separatorWidth: 3, // the empty spacing in pixels between successive commands
    spotlightPadding: 4, // extra spacing in pixels between the element and the spotlight
    adaptativeNodeSpotlightRadius: false, // specify whether the spotlight radius should adapt to the node size
    minSpotlightRadius: 24, // the minimum radius in pixels of the spotlight (ignored for the node if adaptativeNodeSpotlightRadius is enabled but still used for the edge & background)
    maxSpotlightRadius: 38, // the maximum radius in pixels of the spotlight (ignored for the node if adaptativeNodeSpotlightRadius is enabled but still used for the edge & background)
    openMenuEvents: 'cxttapstart taphold', // space-separated cytoscape events that will open the menu; only `cxttapstart` and/or `taphold` work here
    itemColor: 'white', // the colour of text in the command's content
    itemTextShadowColor: 'transparent', // the text shadow colour of the command's content
    zIndex: 9999, // the z-index of the ui div
    atMouse: false, // draw menu at mouse position
    outsideMenuCancel: false // if set to a number, this will cancel the command if the pointer is released outside of the spotlight, padded by the number given
  };

  //@ts-ignore
  cy.cxtmenu(ctxMenu);

  return cy;
}

/**
 * Sets slider values for and renders graph after this
 * @param slider_epoch
 * @param slider_cell
 * @param provenance
 * @param cy
 * @param nbPanel
 */
export function InitialRender(
  slider_epoch: HTMLInputElement,
  slider_cell: HTMLInputElement,
  provenance: ProvenanceData,
  cy: cytoscape.Core,
  nbPanel: NotebookPanel,
  force = false
) {
  if (provenance) {
    if (force || renderOnUpdate.get()) {
      slider_epoch.max = (provenance.epochs.length - 1).toString();
      slider_epoch.value = (provenance.epochs.length - 1).toString();

      slider_cell.max = (
        provenance.epochs[provenance.epochs.length - 1].data.length - 1
      ).toString();
      slider_cell.value = (
        provenance.epochs[provenance.epochs.length - 1].data.length - 1
      ).toString();

      sliderValues[nbPanel.id].set({
        epoch: {
          max: provenance.epochs.length - 1,
          value: provenance.epochs.length - 1
        },
        cell: {
          max: provenance.epochs[provenance.epochs.length - 1].data.length - 1,
          value: provenance.epochs[provenance.epochs.length - 1].data.length - 1
        }
      });

      RenderCytoscape(
        cy,
        provenance.epochs.length - 1,
        provenance.epochs[provenance.epochs.length - 1].data.length - 1,
        provenance,
        nbPanel
      );
    } else {
      slider_epoch.max = (provenance.epochs.length - 1).toString();

      slider_cell.max = (
        provenance.epochs[provenance.epochs.length - 1].data.length - 1
      ).toString();

      sliderValues[nbPanel.id].set({
        epoch: {
          max: provenance.epochs.length - 1,
          value: slider_epoch.value
        },
        cell: {
          max: provenance.epochs[parseInt(slider_epoch.value)].data.length - 1,
          value: slider_cell.value
        }
      });
    }
  }
}

/**
 * Changes the epoch slider and then renders the graph
 * @param slider_epoch
 * @param slider_cell
 * @param provenance
 * @param cy
 * @param nbPanel
 */
export function EpochChangeRender(
  slider_epoch: HTMLInputElement,
  slider_cell: HTMLInputElement,
  provenance: ProvenanceData,
  cy: cytoscape.Core,
  nbPanel: NotebookPanel
) {
  if (provenance) {
    slider_cell.max = //@ts-ignore
    (
      provenance.epochs[parseInt(slider_epoch.value)].data.length - 1
    ).toString();
    slider_cell.value = //@ts-ignore
    (
      provenance.epochs[parseInt(slider_epoch.value)].data.length - 1
    ).toString();

    sliderValues[nbPanel.id].set({
      epoch: {
        max: parseInt(slider_epoch.max),
        value: parseInt(slider_epoch.value)
      },
      cell: {
        max: provenance.epochs[parseInt(slider_epoch.value)].data.length - 1,
        value: provenance.epochs[parseInt(slider_epoch.value)].data.length - 1
      }
    });

    RenderCytoscape(
      cy,
      parseInt(slider_epoch.value),
      provenance.epochs[parseInt(slider_epoch.value)].data.length - 1,
      provenance,
      nbPanel
    );
  }
}

/**
 * Changes the execution cell slider and than updates the graph
 * @param slider_epoch
 * @param slider_cell
 * @param provenance
 * @param cy
 * @param nbPanel
 */
export function CellChangeRender(
  slider_epoch: HTMLInputElement,
  slider_cell: HTMLInputElement,
  provenance: ProvenanceData,
  cy: cytoscape.Core,
  nbPanel: NotebookPanel
) {
  if (provenance) {
    sliderValues[nbPanel.id].set({
      epoch: {
        max: parseInt(slider_epoch.max),
        value: parseInt(slider_epoch.value)
      },
      cell: {
        max: parseInt(slider_cell.max),
        value: parseInt(slider_cell.value)
      }
    });

    RenderCytoscape(
      cy,
      parseInt(slider_epoch.value),
      parseInt(slider_cell.value),
      provenance,
      nbPanel
    );
  }
}

/**
 * Applies the layout to the cytoscape instance
 * @param cy
 */
function LayoutCytoscape(cy: cytoscape.Core) {
  cy.layout({
    name: 'cose-bilkent',
    //@ts-ignore
    idealEdgeLength: 150
  }).run();
}

/**
 * Renders a cytoscape instance with the given provenance information of a notebook panel
 * @param cy
 * @param epoch_index
 * @param cell_index
 * @param prov
 * @param nbPanel
 */
async function RenderCytoscape(
  cy: cytoscape.Core,
  epoch_index: number,
  cell_index: number,
  prov: ProvenanceData,
  nbPanel: NotebookPanel
) {
  // Remove all old elements
  cy.remove(cy.elements());

  var epoch = prov.epochs[epoch_index];
  var epoch_cells = epoch.cells;
  var executed_cells: string[] = [];
  if (showLastExecute.value) {
    // Get cell of the last execution
    var cell_id = epoch.data[cell_index].cell_id;
    var iter = nbPanel.content.model.cells.iter();

    // Find the corresponding notebook cell if there
    var nextCellModel = iter.next();
    while (nextCellModel) {
      if (nextCellModel.metadata.toJSON()['prov_id'] == cell_id) {
        break;
      }
      nextCellModel = iter.next();
    }
    for (let index = 0; index < epoch_cells.length; index++) {
      const element = epoch_cells[index];
      if (element == cell_id) {
        cy.add({
          group: 'nodes',
          data: { id: cell_id, label: 'Cell: ' + (index + 1).toString() },
          classes: nextCellModel ? 'top-center' : 'top-center Deleted'
        });
        break;
      }
    }
    executed_cells.push(cell_id);
  } else {
    // Look trough all cells in an epoch and see if tey got executed
    for (let index = 0; index < epoch_cells.length; index++) {
      const element = epoch_cells[index];

      // See if cell already got executed
      for (let index2 = 0; index2 <= cell_index; index2++) {
        const cell = epoch.data[index2];
        if (cell.cell_id == element) {
          // Add cell if it got executed already
          var iter = nbPanel.content.model.cells.iter();

          // Find cell in the notebook panel
          var nextCellModel = iter.next();
          while (nextCellModel) {
            if (nextCellModel.metadata.toJSON()['prov_id'] == element) {
              break;
            }
            nextCellModel = iter.next();
          }

          // Add the parent for the cells
          cy.add({
            group: 'nodes',
            data: { id: element, label: 'Cell: ' + (index + 1).toString() },
            classes: nextCellModel ? 'top-center' : 'top-center Deleted'
          });
          executed_cells.push(element);
          break;
        }
      }
    }
  }

  var last_executes: Array<{ pos: number; cell: CellData }> = [];

  // Find last execute of an executed cell
  for (let index = 0; index < executed_cells.length; index++) {
    const element = executed_cells[index];

    for (let index2 = cell_index; index2 >= 0; index2--) {
      const cell = epoch.data[index2];
      if (cell.cell_id == element) {
        last_executes.push({ pos: index2, cell: cell });
        break;
      }
    }
  }

  var edgePromises: Array<Promise<any>> = [];

  // Find connections between last executes and other ones
  last_executes.forEach(exec => {
    edgePromises.push(
      CreateEdges(cy, exec, epoch.data, epoch_index, epoch_cells, nbPanel)
    );
  });

  await Promise.all(edgePromises);
  // Rerun layout
  LayoutCytoscape(cy);
  var executions: Array<number> = [];
  cy.$('node:childless').forEach(element => {
    //@ts-ignore
    executions.push(element.data()['execution_count']);
  });
  displayedExecutions[nbPanel.id].set(executions.sort((a, b) => a - b));
}

/**
 * Recursively searches for dependencies of earlier executed cells and creates edges and nodes for them in the graph
 * @param cy
 * @param element
 * @param data
 * @param epoch_index
 * @param epoch_cells
 * @param nbPanel
 * @returns
 */
async function CreateEdges(
  cy: cytoscape.Core,
  element: { pos: number; cell: CellData },
  data: Array<CellData>,
  epoch_index: number,
  epoch_cells: Array<string>,
  nbPanel: NotebookPanel
): Promise<boolean> {
  var edges: Array<{
    cell: CellData;
    dataSource: boolean;
    vars: Array<string>;
    execution_count: number;
    pos: number;
    import: boolean;
  }> = [];
  var dataSource = element.cell.data_vars.length != 0;

  // Iterate trough all remote dependencies of a cell
  for (let i = 0; i < element.cell.remote.length; i++) {
    const value = element.cell.remote[i];

    // Iterate trough all earlier executions until all dependencies are found
    for (let index = element.pos; index >= 0; index--) {
      const remote = data[index];

      // If found remote cell not already exists add it to a list to check itself
      if (remote.local.includes(value)) {
        var remoteCell = edges.find(
          el => el.execution_count == remote.execution_count && !el.import
        );
        if (remoteCell) {
          remoteCell.vars.push(value);
        } else {
          edges.push({
            cell: remote,
            dataSource: false,
            vars: [value],
            execution_count: remote.execution_count,
            pos: index,
            import: false
          });
        }
        break;
        // If imports should be rendered also search for them
      } else if (renderImports.get() && remote.imports.includes(value)) {
        var remoteCell = edges.find(
          el => el.execution_count == remote.execution_count && el.import
        );
        if (remoteCell) {
          remoteCell.vars.push(value);
        } else {
          edges.push({
            cell: remote,
            dataSource: false,
            vars: [value],
            execution_count: remote.execution_count,
            pos: index,
            import: true
          });
        }
        break;
      }
    }
  }

  // Add the target node if its not already there
  if (!cy.$id(element.cell.cell_id)[0]) {
    for (let index = 0; index < epoch_cells.length; index++) {
      const el = epoch_cells[index];
      if (el == element.cell.cell_id) {
        var iter = nbPanel.content.model.cells.iter();

        // Search for notebook cell to see if it got deleted
        var nextCellModel = iter.next();
        while (nextCellModel) {
          if (nextCellModel.metadata.toJSON()['prov_id'] == el) {
            break;
          }
          nextCellModel = iter.next();
        }

        // Add cell group
        cy.add({
          group: 'nodes',
          data: {
            id: element.cell.cell_id,
            label: 'Cell: ' + (index + 1).toString()
          },
          classes: nextCellModel ? 'top-center' : 'top-center Deleted'
        });
        break;
      }
    }
  }
  if (
    !cy.$id(element.cell.cell_id + element.cell.execution_count.toString())[0]
  ) {
    var class_string = '';
    if (element.cell.data_vars.length != 0) class_string += 'DataSource';
    if (element.cell.cell_outputs.length != 0) class_string += 'Output';
    if (element.cell.type == 'error') class_string += 'Error';

    // Add the execution into the cell group in the graph
    cy.add({
      group: 'nodes',
      classes: class_string,
      data: {
        id: element.cell.cell_id + element.cell.execution_count.toString(),
        parent: element.cell.cell_id,
        execution_count: element.cell.execution_count,
        epoch: epoch_index,
        label: element.cell.execution_count.toString(),
        data_source: element.cell.data_vars
      }
    });
  }

  for (let index = 0; index < edges.length; index++) {
    const remote = edges[index];
    // wait for earlier executions to be created
    var remoteDataSource = await CreateEdges(
      cy,
      { pos: remote.pos - 1, cell: remote.cell },
      data,
      epoch_index,
      epoch_cells,
      nbPanel
    );
    if (remoteDataSource) {
      dataSource = remoteDataSource;
    }
    remote.dataSource = remoteDataSource;

    // creation of the edges between executions
    for (let i = 0; i < remote.vars.length; i++) {
      const value = remote.vars[i];

      var edge_id: string =
        element.cell.cell_id +
        element.cell.execution_count.toString() +
        remote.cell.cell_id +
        remote.execution_count.toString() +
        value;

      var edgeClasses = remoteDataSource ? 'DataSource ' : '';
      edgeClasses += remote.import ? 'Import' : '';

      // Add the new edge
      if (
        !cy.$id(edge_id)[0] &&
        element.cell.execution_count != remote.execution_count
      ) {
        cy.add({
          group: 'edges',
          classes: edgeClasses,
          data: {
            id: edge_id,
            target:
              element.cell.cell_id + element.cell.execution_count.toString(),
            source: remote.cell.cell_id + remote.execution_count.toString(),
            execution_count: remote.execution_count.toString(),
            epoch: epoch_index,
            source_id: remote.cell.cell_id,
            label: value
          }
        });
      }
    }
  }

  return dataSource;
}
