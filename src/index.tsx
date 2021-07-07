/**
 * JupyterLab imports
 */

 import { Kernel } from '@jupyterlab/services';

 import {
   JupyterFrontEnd,
   JupyterFrontEndPlugin,
   ILayoutRestorer
 } from '@jupyterlab/application';
 
 import { DocumentRegistry } from '@jupyterlab/docregistry';
 import {
   INotebookModel,
   NotebookPanel,
   INotebookTracker
 } from '@jupyterlab/notebook';
 
 import { Cell } from '@jupyterlab/cells';
 
 import { IDisposable } from '@lumino/disposable';
 
 import { OutputAreaModel, SimplifiedOutputArea } from '@jupyterlab/outputarea';
 
 import {
   MainAreaWidget,
   ToolbarButton,
   WidgetTracker,
   ReactWidget
 } from '@jupyterlab/apputils';
 import { requestAPI } from './handler';
 import { Widget } from '@lumino/widgets';
 
 import { CellData, ProvenanceData } from './interfaces';
 import {
   InitCytoscape,
   InitialRender,
   EpochChangeRender,
   CellChangeRender
 } from './visual';
 import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
 
 /**
  * Other imports
  */
 import React from 'react';
 import {
   DiffReactComponent,
   ProvReactComponent,
   InfoReactComponent,
   NotebookReactComponent
 } from './components';
 
 import {
   cyInstancesGet,
   cyInstancesSet,
   rendermimeInstanceSet,
   sliderValues,
   zoomOnSelect
 } from './states';
 
 class ButtonExtension
   implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel>
 {
   constructor(app: JupyterFrontEnd) {
     this.app = app;
   }
   createNew(
     panel: NotebookPanel,
     context: DocumentRegistry.IContext<INotebookModel>
   ): IDisposable {
     // Create the toolbar button
     let mybutton = new ToolbarButton({
       label: 'MLProvLab',
       onClick: () => {
         this.app.commands.execute('prov-tracking:open');
       }
     });
 
     // Add the toolbar button to the notebook toolbar
     panel.toolbar.insertItem(10, 'mybutton', mybutton);
 
     // The ToolbarButton class implements `IDisposable`, so the
     // button *is* the extension for the purposes of this method.
     return mybutton;
   }
 
   protected app: JupyterFrontEnd;
 }
 
 //@ts-ignore
 class ProvenanceWidget extends MainAreaWidget {
   constructor(nbPath: string, options: MainAreaWidget.IOptions<Widget>) {
     super(options);
     this.nbPath = nbPath;
   }
 
   readonly nbPath: string;
 }
 
 class DiffWidget extends MainAreaWidget {
   constructor(
     nbPath: string,
     options: MainAreaWidget.IOptions<Widget>,
     epoch: number,
     cell_id: string,
     execution_count: number
   ) {
     super(options);
     this.nbPath = nbPath;
     this.epoch = epoch;
     this.cell_id = cell_id;
     this.execution_count = execution_count;
   }
 
   readonly nbPath: string;
   readonly epoch: number;
   readonly cell_id: string;
   readonly execution_count: number;
 }
 
 class InfoWidget extends DiffWidget {
   constructor(
     nbPath: string,
     options: MainAreaWidget.IOptions<Widget>,
     epoch: number,
     cell_id: string,
     execution_count: number,
     variable: string | null
   ) {
     super(nbPath, options, epoch, cell_id, execution_count);
     this.variable = variable;
   }
 
   readonly variable: string | null;
 }
 
 /**
  * Initialization data for the mlprovlab extension.
  */
 const extension: JupyterFrontEndPlugin<void> = {
   id: 'mlprovlab:plugin',
   autoStart: true,
   requires: [ILayoutRestorer, INotebookTracker, IRenderMimeRegistry],
   activate: (
     app: JupyterFrontEnd,
     restorer: ILayoutRestorer,
     nbTracker: INotebookTracker,
     rendermime: IRenderMimeRegistry
   ) => {
     app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension(app));
 
     rendermimeInstanceSet(rendermime);
 
     var counter = 0;
     var lock = 0;
 
     //#region Error tracking
 
     // Dictionaries for info requests
     var msgDict: any = {};
     var infoDict: any = {};
     var cellDict: any = {};
     var promiseDict: any = {};
     var kernelInfo: any = {};
 
     const attachTracker = function (nbPanel: NotebookPanel) {
       const trackExecution = function (
         _: Kernel.IKernelConnection,
         message: Kernel.IAnyMessageArgs
       ) {
         if (
           message.direction == 'send' &&
           message.msg.header.msg_type == 'execute_request'
         ) {
           var iter = nbPanel.content.model.cells.iter();
           var cell = iter.next();
           while (cell) {
             if (cell.id == message.msg.metadata.cellId) {
               break;
             }
             cell = iter.next();
           }
 
           msgDict[cell.id] = [];
           cellDict[message.msg.header.msg_id] = cell.id;
 
           var local: string[];
 
           // Get the local variables of the execution
           while (!local) local = infoDict[cell.id]['local'];
 
           var inspectPromises: Array<Promise<any>> = [];
 
           // Execute the inspect requests for the execution
           if (local != []) {
             for (let index = 0; index < local.length; index++) {
               const element = local[index];
               inspectPromises.push(
                 nbPanel.sessionContext.session.kernel.requestInspect({
                   code: element.trim(),
                   cursor_pos: 0,
                   detail_level: 1
                 })
               );
             }
           }
 
           // Get expect results and put them in storage
           const inspectWait = async function () {
             for await (var val of inspectPromises) {
               //@ts-ignore
               if (val.content.data['text/plain']) {
                 //@ts-ignore
                 var data: any = val.content.data['text/plain'].split(
                   /(\u001b\[1;31m[\w\s]+:\u001b\[0m)/
                 );
 
                 //@ts-ignore
                 var str: string = '';
 
                 for (let index = 1; index < data.length; index += 2) {
                   const regex = data[index];
 
                   if (
                     regex.search('Source:') == -1 &&
                     regex.search('Class docstring:') == -1
                   ) {
                     str += regex + data[index + 1];
                   }
                 }
                 //@ts-ignore
                 msgDict[cell.id].push(str);
               } else {
                 msgDict[cell.id].push('');
               }
             }
           };
           promiseDict[message.msg.header.msg_id] = inspectWait();
         }
 
         // If error message is there find corresponding cell in the notebook panel
         if (
           message.direction == 'recv' &&
           message.msg.header.msg_type == 'execute_reply' &&
           //@ts-ignore
           (message.msg.content.status == 'error' ||
             //@ts-ignore
             message.msg.content.status == 'ok')
         ) {
           //Set counter so that other possible connections wait
           var local_counter = counter;
           counter += 1;
 
           // Attach to contentChanged because the modelDB does update later
           const getExecutionCount = async function getExecutionCountFunc() {
             var iter = nbPanel.content.model.cells.iter();
             var cell = iter.next();
             //@ts-ignore
             var execution_count = message.msg.content.execution_count;
             while (cell) {
               if (
                 //@ts-ignore
                 cell.id == cellDict[message.msg.parent_header.msg_id]
               ) {
                 break;
               }
               cell = iter.next();
             }
 
             var prov: any;
             var prov_init = false;
 
             var local: string[] = [];
             var remote: string[] = [];
             var imports: string[] = [];
             var modules: string[] = [];
             var local_info: {} = {};
             var cell_id: string;
             var data_vars: string[] = [];
             var data_values: string[] = [];
             var definitions: Array<any>;
             var timestamp = new Date().toUTCString();
 
             if (cell.toJSON().cell_type === 'code') {
               var data = infoDict[cell.id];
               definitions = data['definitions'];
               local = data['local'];
               remote = data['remote'];
               imports = data['imports'];
               modules = data['modules'];
               data_vars = data['data_vars'];
               data_values = data['data_values'];
 
               //@ts-ignore
               await promiseDict[message.msg.parent_header.msg_id];
               if (local != []) {
                 for (let index = 0; index < local.length; index++) {
                   const element = local[index];
                   //@ts-ignore
                   local_info[element] = msgDict[cell.id][index];
                 }
               }
 
               while (lock < local_counter) {
                 await new Promise(r => setTimeout(r, 100));
               }
 
               if (nbPanel.model.metadata.has('provenance')) {
                 prov = nbPanel.model.metadata.toJSON().provenance;
               } else {
                 prov = { epochs: [], cells: [] };
                 prov_init = true;
               }
 
               if (cell.metadata.has('prov_id')) {
                 cell_id = cell.metadata.get('prov_id').toString();
               } else {
                 cell.metadata.set('prov_id', cell.id);
                 cell_id = cell.id;
               }
 
               if (!prov['cells'].includes(cell_id)) {
                 prov.cells.push(cell_id);
               }
 
               // General structure of provenance data
               var prov_data: CellData = {
                 cell_id: cell_id,
                 cell_source: cell.toJSON().source,
                 //@ts-ignore
                 cell_outputs: cell.toJSON().outputs,
                 execution_count: execution_count,
                 type:
                   //@ts-ignore
                   message.msg.content.status == 'ok' ? 'execution' : 'error',
                 local: local,
                 remote: remote,
                 imports: imports,
                 local_info: local_info,
                 data_values: data_values,
                 data_vars: data_vars,
                 definitions: definitions,
                 time: timestamp
               };
 
               if (lock === local_counter) {
                 if (execution_count == 1 || prov_init) {
                   prov.epochs.push({
                     modules: modules,
                     data: [prov_data],
                     cells: [cell_id],
                     environment: {
                       time: new Date().toUTCString(),
                       user_agent: navigator.userAgent,
                       kernel: {
                         //@ts-ignore
                         implementation: kernelInfo.implementation,
                         //@ts-ignore
                         version: kernelInfo.implementation_version
                       },
                       language_info: {
                         //@ts-ignore
                         name: kernelInfo.language_info.name,
                         //@ts-ignore
                         version: kernelInfo.language_info.version,
                         //@ts-ignore
                         mimetype: kernelInfo.language_info.mimetype
                       }
                     }
                   });
 
                   nbPanel.model.metadata.set('provenance', prov);
                 } else {
                   // Add cell to used cell in the epoch if its not already there
                   if (
                     !prov.epochs[prov.epochs.length - 1]['cells'].includes(
                       cell_id
                     )
                   ) {
                     prov.epochs[prov.epochs.length - 1].cells.push(cell_id);
                   }
 
                   // Add new collected provenance data
                   prov.epochs[prov.epochs.length - 1].data.push(prov_data);
 
                   // Add new imported modules if any
                   if (modules) {
                     prov.epochs[prov.epochs.length - 1].modules = {
                       ...prov.epochs[prov.epochs.length - 1].modules,
                       ...modules
                     };
                   }
 
                   nbPanel.model.metadata.set('provenance', prov);
                 }
 
                 //nbPanel.context.save();
                 lock += 1;
               }
             } else {
               while (lock < local_counter) {
                 await new Promise(r => setTimeout(r, 100));
               }
 
               lock += 1;
             }
           };
 
           getExecutionCount();
         }
 
         if (
           message.direction == 'recv' &&
           message.msg.header.msg_type == 'kernel_info_reply'
         ) {
           kernelInfo = message.msg.content;
         }
       };
 
       const focusNode = async function focusNodeFunc(_: any, cell: Cell) {
         if (typeof cell != 'undefined') {
           var cellData = cell.model.metadata.toJSON();
           var cy: cytoscape.Core = cyInstancesGet()[nbPanel.context.path];
           if (cellData['prov_id'] && cy) {
             try {
               cy.$(':selected').forEach(el => {
                 el.unselect();
               });
               var node = cy.$(`node[id="${cellData['prov_id']}"]`)[0];
               node.select();
               if (zoomOnSelect.value) cy.fit(node, 200);
             } catch (error) {}
           }
         }
       };
       nbPanel.content.activeCellChanged.connect(focusNode);
 
       // We need to execute AST Analyze after every cell change because we cant do it if a cell is executed
       nbPanel.model.cells.changed.connect((_, args) => {
         if (args.newValues[0]) {
           requestAPI<any>('analyze', {
             body: JSON.stringify(args.newValues[0].toJSON().source.toString()),
             method: 'POST'
           })
             .then(data => {
               infoDict[args.newValues[0].id] = data;
             })
             .catch(reason => {
               console.error(
                 `Error analyzing code (probably because you used ipython magic).\n${reason}`
               );
             });
           args.newValues[0].contentChanged.connect(cell => {
             requestAPI<any>('analyze', {
               body: JSON.stringify(cell.toJSON().source.toString()),
               method: 'POST'
             })
               .then(data => {
                 infoDict[cell.id] = data;
               })
               .catch(reason => {
                 console.error(
                   `Error analyzing code (probably because you used ipython magic).\n${reason}`
                 );
               });
           });
         }
       });
 
       // Attach function to kernel to get error messages
       nbPanel.context.sessionContext.kernelChanged.connect(async (_, args) => {
         args.newValue.anyMessage.connect(trackExecution);
       });
     };
 
     nbTracker.restored.then(() => {
       nbTracker.forEach(attachTracker);
 
       nbTracker.widgetAdded.connect((_, nbPanel) => {
         attachTracker(nbPanel);
       });
     });
     //#endregion Error tracking
 
     //#region Main widget open command
     const ProvenanceCommand: string = 'prov-tracking:open';
     app.commands.addCommand(ProvenanceCommand, {
       execute: args => {
         var { title, id, path } = args;
 
         //@ts-ignore
         var notebookPanel: NotebookPanel;
         if (!path) {
           //@ts-ignore
           notebookPanel = nbTracker.currentWidget;
         } else {
           notebookPanel = nbTracker.find(nb => nb.context.path === path);
         }
         var widget_id: any;
         if (id) {
           //@ts-ignore
           widget_id = id;
         } else {
           widget_id = 'provenance-widget-' + notebookPanel.context.path;
         }
 
         var iter = app.shell.widgets();
         var next = iter.next();
         var widget: ProvenanceWidget;
         while (next) {
           if (next.id == widget_id) {
             //@ts-ignore
             widget = next;
             next = undefined;
           } else {
             next = iter.next();
           }
         }
 
         if (!widget || widget.isDisposed) {
           // Create a new widget if one does not exist
           // or if the previous one was disposed after closing the panel
 
           //@ts-ignore
           let prov: ProvenanceData =
             notebookPanel.context.model.metadata.toJSON()['provenance'];
 
           // This need to be called before the prov component is created so the sliders and values of them are displayed properly
           if (typeof prov != 'undefined') {
             sliderValues[notebookPanel.id].set({
               epoch: {
                 max: prov.epochs.length == 0 ? prov.epochs.length - 1 : 0,
                 value: prov.epochs.length == 0 ? prov.epochs.length - 1 : 0
               },
               cell: {
                 max:
                   prov.epochs.length == 0
                     ? prov.epochs[prov.epochs.length - 1].data.length - 1
                     : 0,
                 value:
                   prov.epochs.length == 0
                     ? prov.epochs[prov.epochs.length - 1].data.length - 1
                     : 0
               }
             });
           }
 
           const content = ReactWidget.create(
             <ProvReactComponent
               widget_id={widget_id}
               notebook={notebookPanel}
               app={app}
             ></ProvReactComponent>
           );
           if (path) {
             //@ts-ignore
             widget = new ProvenanceWidget(path, { content });
           } else {
             widget = new ProvenanceWidget(notebookPanel.context.path, {
               content
             });
           }
 
           if (title) {
             //@ts-ignore
             widget.title.label = title;
           } else {
             widget.title.label = 'Provenance: ' + notebookPanel.title.label;
           }
 
           widget.title.closable = true;
           //@ts-ignore
           widget.id = widget_id;
         }
         if (!tracker.has(widget)) {
           // Track the state of the widget for later restoration
           tracker.add(widget);
         }
         if (!widget.isAttached) {
           // Attach the widget to the main work area if it's not there
           app.shell.add(widget, 'main', { mode: 'split-right' });
           //const content2 = new Widget();
           //const widget2 = new MainAreaWidget({ content: content2 });
           //app.shell.add(widget2, 'main', { mode: 'split-top', ref: widget.id })
 
           //@ts-ignore
           var cy = InitCytoscape('cytoscape-' + widget_id, app, path);
           cyInstancesSet({
             ...cyInstancesGet(),
             ...{ [notebookPanel.context.path]: cy }
           });
 
           var epoch_slider = document.getElementById(
             'prov-epoch-slider-' + widget_id
           );
           var cell_slider = document.getElementById(
             'prov-cell-slider-' + widget_id
           );
 
           //@ts-ignore
           var prov =
             notebookPanel.context.model.metadata.toJSON()['provenance'];
 
           epoch_slider.addEventListener('input', ev => {
             EpochChangeRender(
               //@ts-ignore
               epoch_slider,
               cell_slider,
               notebookPanel.context.model.metadata.toJSON()['provenance'],
               cy,
               notebookPanel
             );
           });
 
           cell_slider.addEventListener('input', ev => {
             CellChangeRender(
               //@ts-ignore
               epoch_slider,
               cell_slider,
               notebookPanel.context.model.metadata.toJSON()['provenance'],
               cy,
               notebookPanel
             );
           });
 
           const render = (_: any, args: any) => {
             if (args.newValue) {
               if (args.oldValue === undefined && args.key === 'provenance') {
                 InitialRender(
                   //@ts-ignore
                   epoch_slider,
                   cell_slider,
                   args.newValue,
                   cy,
                   notebookPanel,
                   true
                 );
               } else if (
                 args.key === 'provenance' &&
                 //@ts-ignore
                 args.oldValue.length === args.newValue.length
               ) {
                 InitialRender(
                   //@ts-ignore
                   epoch_slider,
                   cell_slider,
                   args.newValue,
                   cy,
                   notebookPanel
                 );
               } else if (
                 args.key === 'provenance' &&
                 //@ts-ignore
                 args.oldValue.length !== args.newValue.length
               ) {
                 InitialRender(
                   //@ts-ignore
                   epoch_slider,
                   cell_slider,
                   args.newValue,
                   cy,
                   notebookPanel
                 );
               }
             }
           };
 
           notebookPanel.context.model.metadata.changed.connect(render);
 
           widget.disposed.connect(() => {
             notebookPanel.context.model.metadata.changed.disconnect(render);
           });
 
           if (prov) {
             //@ts-ignore
             InitialRender(epoch_slider, cell_slider, prov, cy, notebookPanel, true);
           }
         }
 
         widget.content.update();
 
         // Activate the widget
         app.shell.activateById(widget.id);
       }
     });
     //#endregion Main widget open command
 
     //#region Diff widget open command
     const DiffCommand: string = 'prov-diff:open';
     app.commands.addCommand(DiffCommand, {
       execute: args => {
         //@ts-ignore
         var { title, id, path, cell_id, execution_count, epoch } = args;
 
         //@ts-ignore
         var notebookPanel: NotebookPanel;
         if (!path) {
           //@ts-ignore
           notebookPanel = nbTracker.currentWidget;
         } else {
           notebookPanel = nbTracker.find(nb => nb.context.path === path);
         }
 
         var widget_id: string;
         if (id) {
           //@ts-ignore
           widget_id = id;
         } else {
           widget_id = 'provenance-diff-widget-' + notebookPanel.context.path;
         }
 
         var iter = app.shell.widgets();
         var next = iter.next();
         var widget: DiffWidget;
         while (next) {
           if (next.id == widget_id) {
             //@ts-ignore
             widget = next;
             next = undefined;
           } else {
             next = iter.next();
           }
         }
 
         if (widget) {
           widget.dispose();
         }
 
         if (!widget || widget.isDisposed) {
           // Create a new widget if one does not exist
           // or if the previous one was disposed after closing the panel
 
           var content: Widget = new Widget();
 
           //@ts-ignore
           var data: ProvenanceData =
             notebookPanel.context.model.metadata.toJSON()['provenance'];
 
           if (data) {
             var source = data.epochs[parseInt(epoch.toString())].data.find(
               el => el.execution_count == parseInt(execution_count.toString())
             );
             var source_list: Array<string> = [source.cell_source.toString()];
             var cell_list: Array<CellData> = [];
             var epoch_list: Array<number> = [];
 
             // Filter only selected cell
             for (let index = 0; index < epoch; index++) {
               const epochs = data.epochs[index];
 
               for (
                 let index_cell = 0;
                 index_cell < epochs.data.length;
                 index_cell++
               ) {
                 const cell = epochs.data[index_cell];
                 if (
                   cell.cell_id == cell_id &&
                   !source_list.includes(cell.cell_source.toString())
                 ) {
                   source_list.push(cell.cell_source.toString());
                   cell_list.push(cell);
                   epoch_list.push(index);
                 }
               }
             }
 
             cell_list.push(source);
             epoch_list.push(parseInt(epoch.toString()));
 
             content = ReactWidget.create(
               <DiffReactComponent
                 data={cell_list}
                 epoch={epoch_list}
                 execution_count={parseInt(execution_count.toString())}
               />
             );
           } else {
             notebookPanel.context.model.metadata.changed.connect((_, args) => {
               if (args.oldValue === undefined && args.key === 'provenance') {
                 if (widget) {
                   widget.dispose();
                 }
 
                 app.commands.execute('prov-diff:open', {
                   title,
                   id,
                   path,
                   cell_id,
                   execution_count,
                   epoch
                 });
               }
             });
           }
 
           if (path) {
             widget = new DiffWidget(
               //@ts-ignore
               path,
               { content },
               epoch,
               cell_id,
               execution_count
             );
           } else {
             widget = new DiffWidget(
               notebookPanel.context.path,
               { content },
               parseInt(epoch.toString()),
               //@ts-ignore
               cell_id,
               execution_count
             );
           }
 
           if (title) {
             //@ts-ignore
             widget.title.label = title;
           } else {
             widget.title.label = 'Difference: ' + notebookPanel.title.label;
           }
 
           widget.title.closable = true;
           //@ts-ignore
           widget.id = widget_id;
         }
         if (!diffWidgetTracker.has(widget)) {
           // Track the state of the widget for later restoration
           diffWidgetTracker.add(widget);
         }
         if (!widget.isAttached) {
           // Attach the widget to the main work area if it's not there
           app.shell.add(widget, 'main', { mode: 'split-top' });
 
           widget.content.update();
 
           // Activate the widget
           app.shell.activateById(widget.id);
         }
       }
     });
     //#endregion Diff widget open command
 
     //#region Info widget command
     const InfoCommand: string = 'prov-info:open';
     app.commands.addCommand(InfoCommand, {
       execute: args => {
         //@ts-ignore
         var {
           title,
           id,
           path,
           cell_id,
           execution_count,
           epoch,
           //@ts-ignore
           variable
         } = args;
 
         //@ts-ignore
         var notebookPanel: NotebookPanel;
         if (!path) {
           //@ts-ignore
           notebookPanel = nbTracker.currentWidget;
         } else {
           notebookPanel = nbTracker.find(nb => nb.context.path === path);
         }
 
         var widget_id: string;
         if (id) {
           //@ts-ignore
           widget_id = id;
         } else {
           widget_id = 'provenance-info-widget-' + notebookPanel.context.path;
         }
 
         var iter = app.shell.widgets();
         var next = iter.next();
         var widget: InfoWidget;
         while (next) {
           if (next.id == widget_id) {
             //@ts-ignore
             widget = next;
             next = undefined;
           } else {
             next = iter.next();
           }
         }
 
         if (widget) {
           widget.dispose();
         }
 
         if (!widget || widget.isDisposed) {
           // Create a new widget if one does not exist
           // or if the previous one was disposed after closing the panel
 
           //@ts-ignore
           var data: ProvenanceData =
             notebookPanel.context.model.metadata.toJSON()['provenance'];
 
           if (data) {
             var cell = data.epochs[parseInt(epoch.toString())].data.find(
               cell =>
                 cell.execution_count == parseInt(execution_count.toString())
             );
 
             var renderersHTML: Array<{ name: string; text: string }> = [];
 
             if (variable) {
               var text: string = '';
               text =
                 //@ts-ignore
                 cell.local_info[variable];
 
               var mimeType = rendermime.preferredMimeType(
                 {
                   'text/plain': text
                 },
                 'prefer'
               );
               var renderer = rendermime.createRenderer(mimeType);
               var renderModel = rendermime.createModel({
                 //@ts-ignore
                 data: {
                   'text/plain': text
                 }
               });
 
               renderer.renderModel(renderModel);
               renderer.addClass('prov-info');
 
               renderersHTML.push({
                 text: renderer.node.outerHTML,
                 name: variable.toString()
               });
             } else {
               for (
                 let index = 0;
                 index < Object.keys(cell.local_info).length;
                 index++
               ) {
                 const key = Object.keys(cell.local_info)[index];
                 var text: string = '';
                 text +=
                   //@ts-ignore
                   cell.local_info[key];
 
                 var mimeType = rendermime.preferredMimeType(
                   {
                     'text/plain': text
                   },
                   'prefer'
                 );
                 var renderer = rendermime.createRenderer(mimeType);
                 var renderModel = rendermime.createModel({
                   //@ts-ignore
                   data: {
                     'text/plain': text
                   }
                 });
 
                 renderer.renderModel(renderModel);
                 renderer.addClass('prov-info');
 
                 renderersHTML.push({
                   text: renderer.node.outerHTML,
                   name: key
                 });
               }
             }
 
             var output: any;
 
             if (cell.cell_outputs.length != 0) {
               output = new SimplifiedOutputArea({
                 model: new OutputAreaModel({ values: cell.cell_outputs }),
                 rendermime: rendermime
               }).node.outerHTML;
             }
           } else {
             notebookPanel.context.model.metadata.changed.connect((_, args) => {
               if (args.oldValue === undefined && args.key === 'provenance') {
                 if (widget) {
                   widget.dispose();
                 }
                 app.commands.execute('prov-info:open', {
                   title,
                   id,
                   path,
                   cell_id,
                   execution_count,
                   epoch
                 });
               }
             });
           }
 
           const content = ReactWidget.create(
             <InfoReactComponent
               epoch={parseInt(epoch.toString())}
               cell={cell}
               infoElements={renderersHTML}
               outputElement={output}
             ></InfoReactComponent>
           );
 
           if (path) {
             widget = new InfoWidget(
               //@ts-ignore
               path,
               { content },
               epoch,
               cell_id,
               execution_count,
               null
             );
           } else {
             widget = new InfoWidget(
               notebookPanel.context.path,
               {
                 content
               },
               parseInt(epoch.toString()),
               //@ts-ignore
               cell_id,
               execution_count,
               null
             );
           }
 
           if (title) {
             //@ts-ignore
             widget.title.label = title;
           } else {
             widget.title.label = 'Execution: ' + notebookPanel.title.label;
           }
 
           widget.title.closable = true;
           //@ts-ignore
           widget.id = widget_id;
         }
         if (!infoWidgetTracker.has(widget)) {
           // Track the state of the widget for later restoration
           infoWidgetTracker.add(widget);
         }
         if (!widget.isAttached) {
           // Attach the widget to the main work area if it's not there
           app.shell.add(widget, 'main', { mode: 'split-top' });
 
           widget.content.update();
 
           // Activate the widget
           app.shell.activateById(widget.id);
         }
       }
     });
     //#endregion Info widget command
 
     //#region Notebook widget command
 
     const NotebookCommand: string = 'prov-notebook:open';
     app.commands.addCommand(NotebookCommand, {
       execute: args => {
         //@ts-ignore
         var { path } = args;
 
         //@ts-ignore
         var notebookPanel: NotebookPanel;
         if (!path) {
           //@ts-ignore
           notebookPanel = nbTracker.currentWidget;
         } else {
           notebookPanel = nbTracker.find(nb => nb.context.path === path);
         }
 
         var widget_id: string;
         widget_id = 'provenance-notebook-widget-' + notebookPanel.context.path;
 
         var iter = app.shell.widgets();
         var next = iter.next();
         var widget: MainAreaWidget;
         while (next) {
           if (next.id == widget_id) {
             //@ts-ignore
             widget = next;
             next = undefined;
           } else {
             next = iter.next();
           }
         }
 
         if (widget) {
           widget.dispose();
         }
 
         if (!widget || widget.isDisposed) {
           // Create a new widget if one does not exist
           // or if the previous one was disposed after closing the panel
 
           var content: Widget = new Widget();
 
           //@ts-ignore
           var data: ProvenanceData =
             notebookPanel.context.model.metadata.toJSON()['provenance'];
 
           if (data) {
             content = ReactWidget.create(
               <NotebookReactComponent notebookPanel={notebookPanel} />
             );
           } else {
             notebookPanel.context.model.metadata.changed.connect((_, args) => {
               if (args.oldValue === undefined && args.key === 'provenance') {
                 if (widget) {
                   widget.dispose();
                 }
 
                 app.commands.execute('prov-notebook:open', {
                   path
                 });
               }
             });
           }
 
           widget = new MainAreaWidget({ content });
 
           widget.title.label = 'Code info: ' + notebookPanel.title.label;
 
           widget.title.closable = true;
           //@ts-ignore
           widget.id = widget_id;
         }
         if (!widget.isAttached) {
           // Attach the widget to the main work area if it's not there
           app.shell.add(widget, 'main');
 
           widget.content.update();
 
           // Activate the widget
           app.shell.activateById(widget.id);
         }
       }
     });
     //#endregion Info widget command
 
     //#region Focus cell
     //@ts-ignore
     const FocusCell: string = 'prov-utils:focus-cell';
     app.commands.addCommand(FocusCell, {
       execute: args => {
         //@ts-ignore
         var { path, cell_id } = args;
         //@ts-ignore
         var notebookPanel: NotebookPanel;
         if (!path) {
           //@ts-ignore
           notebookPanel = nbTracker.currentWidget;
         } else {
           notebookPanel = nbTracker.find(nb => nb.context.path === path);
         }
 
         var iter = notebookPanel.content.model.cells.iter();
 
         var nextCellModel = iter.next();
         while (nextCellModel) {
           if (nextCellModel.metadata.toJSON()['prov_id'] == cell_id) {
             break;
           }
           nextCellModel = iter.next();
         }
 
         var cellIter = notebookPanel.content.children();
         var nextCell = cellIter.next();
         while (nextCell) {
           //@ts-ignore
           if (nextCell._model.id == nextCellModel.id) {
             break;
           }
           nextCell = cellIter.next();
         }
 
         //@ts-ignore
         if (nextCell) notebookPanel.content.scrollToCell(nextCell);
       }
     });
     //#endregion Info widget command
 
     // Add the command to the palette.
     // palette.addItem({ command: ProvenanceCommand, category: 'Provenance' });
     // palette.addItem({ command: DiffCommand, category: 'Provenance' });
 
     // Track and restore the widget state
 
     let tracker = new WidgetTracker<ProvenanceWidget>({
       namespace: 'provenance'
     });
     restorer.restore(tracker, {
       command: ProvenanceCommand,
       args: widget => ({
         title: widget.title.label,
         id: widget.id,
         path: widget.nbPath
       }),
       // use the id of the widgets here because otherwise they will be overwritten
       name: ev => ev.id,
       when: nbTracker.restored
     });
 
     // Track and restore the widget state
     let diffWidgetTracker = new WidgetTracker<DiffWidget>({
       namespace: 'provenance-diff'
     });
     restorer.restore(diffWidgetTracker, {
       command: DiffCommand,
       args: widget => ({
         title: widget.title.label,
         id: widget.id,
         path: widget.nbPath,
         cell_id: widget.cell_id,
         execution_count: widget.execution_count,
         epoch: widget.epoch
       }),
       // use the id of the widgets here because otherwise they will be overwritten
       name: ev => ev.id,
       when: nbTracker.restored && tracker.restored
     });
 
     // Track and restore the widget state
     let infoWidgetTracker = new WidgetTracker<InfoWidget>({
       namespace: 'provenance-info'
     });
     restorer.restore(infoWidgetTracker, {
       command: InfoCommand,
       args: widget => ({
         title: widget.title.label,
         id: widget.id,
         path: widget.nbPath,
         cell_id: widget.cell_id,
         execution_count: widget.execution_count,
         epoch: widget.epoch,
         variable: widget.variable
       }),
       // use the id of the widgets here because otherwise they will be overwritten
       name: ev => ev.id,
       when: nbTracker.restored && tracker.restored
     });
   }
 };
 
 export default extension;
 