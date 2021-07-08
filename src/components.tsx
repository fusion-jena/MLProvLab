/**
 * JupyterLab imports
 */
 import { NotebookPanel } from '@jupyterlab/notebook';

 import { CellData, ProvenanceData } from './interfaces';
 
 import { download, exportProvenance } from './functions';
 
 import { JupyterFrontEnd } from '@jupyterlab/application';
 
 import { OutputAreaModel, SimplifiedOutputArea } from '@jupyterlab/outputarea';
 
 //@ts-ignore
 import SyntaxHighlighter from 'react-syntax-highlighter';
 
 /**
  * Other imports
  */
 import React, { useState, useEffect } from 'react';
 import ReactDiffViewer from 'react-diff-viewer';
 import { useHookstate } from '@hookstate/core';
 import {
   displayedExecutions,
   renderImports,
   rendermimeInstanceGet,
   renderOnUpdate,
   showLastExecute,
   sliderValues,
   zoomOnSelect
 } from './states';
 
 interface DiffReactComponentProps {
   data: Array<CellData>;
   execution_count: number;
   epoch: Array<number>;
 }
 
 export function DiffReactComponent(props: DiffReactComponentProps) {
   const [slider, setSlider] = useState(props.data.length - 1);
 
   return (
     <div style={{ width: '100%', height: '100%' }}>
       <div
         style={{ overflow: 'auto', width: '100%', height: 'calc(100% - 30px)' }}
       >
         <ReactDiffViewer
           leftTitle={
             'Code at epoch ' +
             props.epoch[slider] +
             ' with execution count ' +
             props.data[slider].execution_count
           }
           rightTitle={
             'Code at epoch ' +
             props.epoch[props.data.length - 1] +
             ' with execution count ' +
             props.execution_count
           }
           showDiffOnly={false}
           newValue={props.data[props.data.length - 1].cell_source.toString()}
           oldValue={props.data[slider].cell_source.toString()}
         ></ReactDiffViewer>
       </div>
 
       <div
         style={{
           display: 'flex',
           flexDirection: 'row',
           flexWrap: 'nowrap',
           height: '30px'
         }}
       >
         <div style={{ flexGrow: 0, paddingLeft: '10px' }}>
           <p style={{ height: '30px', lineHeight: '20px' }}>Changes: </p>
         </div>
 
         <div style={{ flexGrow: 1, paddingLeft: '10px', paddingRight: '10px' }}>
           <input
             type="range"
             defaultValue={slider}
             onInput={el => {
               //@ts-ignore
               setSlider(el.target.value);
             }}
             style={{ width: '100%' }}
             step={1}
             min={0}
             max={props.data.length - 1}
           ></input>
         </div>
       </div>
     </div>
   );
 }
 
 interface ProvReactComponentProps {
   app: JupyterFrontEnd;
   widget_id: Array<CellData>;
   notebook: NotebookPanel;
 }
 
 export function ProvReactComponent(props: ProvReactComponentProps) {
   //@ts-ignore
   const prov: ProvenanceData =
     props.notebook.context.model.metadata.toJSON()['provenance'];
   const menuStyle = {
     flexGrow: 0,
     userSelect: 'none',
     paddingLeft: '10px',
     paddingRight: '10px',
     color: 'black',
     borderRight: '1px solid grey',
     lineHeight: '30px',
     fontSize: '13px'
   };
   const [toggleMenu, setToggleMenu] = useState(false);
   const [selectedMenu, setSelectedMenu] = useState('');
   const slider = useHookstate(sliderValues[props.notebook.id]);
 
   return (
     <div
       style={{
         width: '100%',
         height: '100%',
         position: 'relative'
       }}
     >
       {/** Dropdown Menu */}
       {prov ? (
         <div
           style={{
             width: '100%',
             top: '31px',
             left: '0',
             position: 'absolute',
             borderBottom: '1px solid grey',
             backgroundColor: 'white',
             zIndex: 1,
             display: toggleMenu ? 'initial' : 'none'
           }}
         >
           {selectedMenu == 'Help' ? <HelpMenuReact></HelpMenuReact> : null}
           {selectedMenu == 'Options' ? (
             <OptionMenuReact
               notebook={props.notebook}
               menuToggle={setToggleMenu}
             ></OptionMenuReact>
           ) : null}
           {selectedMenu == 'Environment' && slider.value ? (
             <EnvironmentMenuReact
               epoch={slider.value.epoch.value}
               notebook={props.notebook}
             ></EnvironmentMenuReact>
           ) : null}
           {selectedMenu == 'Import' && slider.value ? (
             <ImportMenuReact
               epoch={slider.value.epoch.value}
               notebook={props.notebook}
             ></ImportMenuReact>
           ) : null}
           {selectedMenu == 'General' && slider.value ? (
             <GeneralMenuReact notebook={props.notebook}></GeneralMenuReact>
           ) : null}
         </div>
       ) : null}
 
       {/** Menu bar */}
       <div
         style={{
           height: '30px',
           borderBottom: '1px solid grey',
           width: '100%',
           display: 'flex',
           flexDirection: 'row',
           position: 'relative'
         }}
       >
         <div
           //@ts-ignore
           style={menuStyle}
           onClick={() => {
             setToggleMenu(!toggleMenu);
             setSelectedMenu('Options');
           }}
         >
           Options
         </div>
         <div
           //@ts-ignore
           style={menuStyle}
           onClick={() => {
             if (prov)
               download('MLPovLabExport.json', exportProvenance(props.notebook));
           }}
         >
           Export
         </div>
         <div
           //@ts-ignore
           style={menuStyle}
           onClick={() => {
             setToggleMenu(!toggleMenu);
             setSelectedMenu('Environment');
           }}
         >
           Environment info
         </div>
         <div
           //@ts-ignore
           style={menuStyle}
           onClick={() => {
             setToggleMenu(!toggleMenu);
             setSelectedMenu('Import');
           }}
         >
           Import info
         </div>
         <div
           //@ts-ignore
           style={menuStyle}
           onClick={() => {
             props.app.commands.execute('prov-notebook:open', {
               path: props.notebook.context.path
             });
           }}
         >
           Code info
         </div>
         <div
           //@ts-ignore
           style={menuStyle}
           onClick={() => {
             setToggleMenu(!toggleMenu);
             setSelectedMenu('General');
           }}
         >
           General info
         </div>
         <div
           //@ts-ignore
           style={menuStyle}
           onClick={() => {
             setToggleMenu(!toggleMenu);
             setSelectedMenu('Help');
           }}
         >
           Help
         </div>
       </div>
       {/** Cytoscape container */}
       <div
         style={{ width: '100%', height: 'calc(100% - 90px)' }}
         id={'cytoscape-' + props.widget_id}
       ></div>
 
       <SliderComponent
         notebook={props.notebook}
         widget_id={props.widget_id}
       ></SliderComponent>
     </div>
   );
 }
 
 interface SliderComponentProps {
   widget_id: Array<CellData>;
   notebook: NotebookPanel;
 }
 
 function SliderComponent(props: SliderComponentProps) {
   //@ts-ignore
   const prov: ProvenanceData =
     props.notebook.context.model.metadata.toJSON()['provenance'];
   const slider = useHookstate(sliderValues[props.notebook.id]);
 
   return (
     <React.Fragment>
       {/** Epoch slider */}
       <div
         style={{
           display: 'flex',
           flexDirection: 'row',
           flexWrap: 'nowrap',
           height: '30px'
         }}
       >
         <div style={{ flexGrow: 0, paddingLeft: '10px', minWidth: '100px' }}>
           {slider.value ? (
             <p style={{ height: '30px', lineHeight: '20px' }}>
               Epoch{' '}
               <b style={{ float: 'right' }}>
                 {slider.value.epoch.value + 1}/{slider.value.epoch.max + 1}
               </b>
             </p>
           ) : null}
         </div>
 
         <div style={{ flexGrow: 1, paddingLeft: '10px', paddingRight: '10px' }}>
           <input
             style={{ width: '100%' }}
             id={'prov-epoch-slider-' + props.widget_id}
             type="range"
             min={0}
             step={1}
             defaultValue={0}
           ></input>
         </div>
 
         <div
           style={{
             flexGrow: 0,
             paddingLeft: '10px',
             paddingRight: '10px',
             minWidth: '200px'
           }}
         >
           {slider.value && prov ? (
             <p style={{ height: '30px', lineHeight: '20px' }}>
               {prov.epochs[slider.value.epoch.value].environment.time}
             </p>
           ) : null}
         </div>
       </div>
       {/** Cell slider */}
       <div
         style={{
           display: 'flex',
           flexDirection: 'row',
           flexWrap: 'nowrap',
           height: '30px'
         }}
       >
         <div style={{ flexGrow: 0, paddingLeft: '10px', minWidth: '100px' }}>
           {slider.value ? (
             <p style={{ height: '30px', lineHeight: '20px' }}>
               Execution{' '}
               <b style={{ float: 'right' }}>
                 {slider.value.cell.value + 1}/{slider.value.cell.max + 1}
               </b>
             </p>
           ) : null}
         </div>
 
         <div style={{ flexGrow: 1, paddingLeft: '10px', paddingRight: '10px' }}>
           <input
             style={{ width: '100%' }}
             id={'prov-cell-slider-' + props.widget_id}
             type="range"
             min={0}
             step={1}
             defaultValue={0}
           ></input>
         </div>
 
         <div
           style={{
             flexGrow: 0,
             paddingLeft: '10px',
             paddingRight: '10px',
             minWidth: '200px'
           }}
         >
           {slider.value && prov ? (
             <p style={{ height: '30px', lineHeight: '20px' }}>
               {
                 prov.epochs[slider.value.epoch.value].data[
                   slider.value.cell.value
                 ].time
               }
             </p>
           ) : null}
         </div>
       </div>
     </React.Fragment>
   );
 }
 
 export function HelpMenuReact() {
   return (
     <div
       style={{
         width: '100%',
         maxHeight: '400px',
         overflowY: 'auto',
         padding: '10px'
       }}
     >
       <p>
         <b>Colours:</b>
         <br></br> <span style={{ color: 'orange' }}>☗</span> A execution is
         coloured orange if a data source was detected. Edges are orange if they
         in any way depend on those sources. <br></br>{' '}
         <span style={{ color: 'green' }}>☗</span> Executions are green if they
         have any sort of output. <br></br>{' '}
         <span style={{ color: 'red' }}>☗</span> A cell group is red if the
         corresponding cell was deleted. Also executions are red if they ended in
         an error. <br></br> <b>Context menu:</b> <br></br> When you right click
         an entity in the graph a context menu will show up. From there you can
         open other widgets to see outputs or information about an execution or
         specific definition. You can also focus a cell when opening the context
         menu for cell groups.
       </p>
     </div>
   );
 }
 
 interface EnvironmentMenuReactProps {
   epoch: number;
   notebook: NotebookPanel;
 }
 
 export function EnvironmentMenuReact(props: EnvironmentMenuReactProps) {
   //@ts-ignore
   const prov: ProvenanceData =
     props.notebook.context.model.metadata.toJSON()['provenance'];
   const environmentData = prov.epochs[props.epoch].environment;
   const padding = '10px';
   const paddingLines = '5px';
   return (
     <div style={{ padding: padding }}>
       <p>
         {' '}
         <b> Environment information of epoch {props.epoch + 1}</b>
       </p>
 
       <p style={{ paddingTop: paddingLines }}>
         <b>Language:</b> {environmentData.language_info.name}
       </p>
       <p style={{ paddingTop: paddingLines }}>
         <b>Version:</b> {environmentData.language_info.version}
       </p>
       <p style={{ paddingTop: paddingLines }}>
         <b>Mimetype: </b>
         {environmentData.language_info.mimetype}
       </p>
 
       <p style={{ paddingTop: paddingLines }}>
         <b>Kernel start time:</b> {environmentData.time}
       </p>
       <p style={{ paddingTop: paddingLines }}>
         <b>Kernel implementation: </b>
         {environmentData.kernel.implementation}
       </p>
       <p style={{ paddingTop: paddingLines }}>
         <b>Kernel version:</b> {environmentData.kernel.version}
       </p>
 
       <p style={{ paddingTop: paddingLines }}>
         <b>User agent:</b> {environmentData.user_agent}
       </p>
     </div>
   );
 }
 
 interface ImportMenuReactProps {
   epoch: number;
   notebook: NotebookPanel;
 }
 
 export function ImportMenuReact(props: ImportMenuReactProps) {
   //@ts-ignore
   const prov: ProvenanceData =
     props.notebook.context.model.metadata.toJSON()['provenance'];
 
   const modules = prov.epochs[props.epoch].modules;
   const data = prov.epochs[props.epoch].data;
   const usage: any = {};
 
   for (let index = 0; index < data.length; index++) {
     const cell = data[index];
     for (let i = 0; i < cell.imports.length; i++) {
       const el = cell.imports[i];
       if (typeof usage[el] == 'undefined') {
         usage[el] =
           JSON.stringify(cell.definitions).split('"' + el + '"').length - 1;
       }
     }
     for (let i = 0; i < cell.local.length; i++) {
       const el = cell.local[i];
       if (typeof usage[el] != 'undefined') usage[el] += 1;
     }
     for (let i = 0; i < cell.remote.length; i++) {
       const el = cell.remote[i];
       if (typeof usage[el] != 'undefined') usage[el] += 1;
     }
   }
   const padding = '10px';
   const border = '1px solid grey';
   const borderDotted = '1px dotted grey';
   return (
     <div
       style={{
         width: '100%',
         maxHeight: '400px',
         overflowY: 'auto'
       }}
     >
       <div
         style={{
           width: '100%',
           padding: padding,
           boxSizing: 'border-box',
           backgroundColor: 'rgba(0, 0, 0, 0.05)'
         }}
       >
         <p>
           Info about imports and modules in epoch <b>{props.epoch + 1}</b>
         </p>
       </div>
       {Object.keys(modules).map((key, index) => {
         return (
           <div style={{ width: '100%' }} key={index}>
             {/** Single imports */}
             {typeof modules[key]['alias'] == 'undefined' &&
             typeof modules[key]['imports'] == 'undefined' ? (
               <div
                 style={{
                   width: '100%',
                   borderTop: border,
                   padding: padding,
                   boxSizing: 'border-box',
                   backgroundColor: usage[key] == 0 ? 'rgba(255,0,0,0.2)' : ''
                 }}
               >
                 <p>
                   Import <b>{key}</b>{' '}
                   {modules[key]['version'] != ''
                     ? 'version ' + modules[key]['version']
                     : null}{' '}
                   was used <b>{usage[key]}</b> times
                 </p>
               </div>
             ) : null}
             {/** Single imports with alias */}
             {typeof modules[key]['alias'] != 'undefined' ? (
               <div
                 style={{
                   width: '100%',
                   borderTop: border,
                   padding: padding,
                   boxSizing: 'border-box',
                   backgroundColor:
                     usage[modules[key]['alias']] == 0 ? 'rgba(255,0,0,0.2)' : ''
                 }}
               >
                 <p>
                   Import <b>{key}</b>{' '}
                   {modules[key]['version'] != ''
                     ? 'version ' + modules[key]['version']
                     : null}{' '}
                   with alias <b>{modules[key]['alias']} </b> was used{' '}
                   <b>{usage[modules[key]['alias']]}</b> times
                 </p>
               </div>
             ) : null}
             {/** Imports out of modules */}
             {typeof modules[key]['imports'] != 'undefined' ? (
               <div style={{ width: '100%' }}>
                 <div
                   style={{
                     width: '100%',
                     borderTop: border,
                     padding: padding,
                     boxSizing: 'border-box'
                   }}
                 >
                   <p>
                     Imports from module <b>{key}</b>:
                   </p>
                 </div>
 
                 {modules[key]['imports'].map((el: any, i: any) => {
                   return (
                     <div
                       style={{
                         width: '100%',
                         paddingLeft: '20px',
                         borderTop: borderDotted,
                         paddingBottom: padding,
                         paddingRight: padding,
                         paddingTop: padding,
                         boxSizing: 'border-box',
                         backgroundColor:
                           usage[el] == 0 ? 'rgba(255,0,0,0.2)' : ''
                       }}
                       key={i}
                     >
                       {typeof el == 'string' ? (
                         <div style={{ width: '100%' }}>
                           <p>
                             Import <b>{el}</b>{' '}
                             {modules[key]['version'] != ''
                               ? 'version ' + modules[key]['version']
                               : null}{' '}
                             was used <b>{usage[el]}</b> times
                           </p>
                         </div>
                       ) : null}
                       {typeof el == 'object' ? (
                         <div
                           style={{
                             width: '100%',
                             paddingLeft: '20px',
                             borderTop: borderDotted,
                             paddingBottom: padding,
                             paddingRight: padding,
                             paddingTop: padding,
                             boxSizing: 'border-box',
                             backgroundColor:
                               usage[el] == 0 ? 'rgba(255,0,0,0.2)' : ''
                           }}
                         >
                           <p>
                             Import <b> {el['name']}</b> with alias{' '}
                             <b>{el['alias']}</b> was used <b>{usage[el]}</b>{' '}
                             times
                           </p>
                         </div>
                       ) : null}
                     </div>
                   );
                 })}
               </div>
             ) : null}
           </div>
         );
       })}
     </div>
   );
 }
 
 interface OptionMenuReactProps {
   notebook: NotebookPanel;
   menuToggle: Function;
 }
 
 export function OptionMenuReact(props: OptionMenuReactProps) {
   const localRenderImports: any = useHookstate(renderImports);
   return (
     <div>
       <div
         style={{
           width: '100%',
           maxHeight: '400px',
           overflowY: 'auto'
         }}
       >
         <div
           style={{
             width: '100%',
             padding: '10px',
             borderBottom: '1px solid grey',
             boxSizing: 'border-box'
           }}
         >
           <input
             style={{ marginRight: '10px' }}
             type={'checkbox'}
             defaultChecked={localRenderImports.get()}
             onChange={ev => localRenderImports.set(ev.target.checked)}
           ></input>
           <label>Show imports in graph</label>
         </div>
         <div
           style={{
             width: '100%',
             padding: '10px',
             borderBottom: '1px solid grey',
             boxSizing: 'border-box'
           }}
         >
           <input
             style={{ marginRight: '10px' }}
             type={'checkbox'}
             defaultChecked={zoomOnSelect.get()}
             onChange={ev => zoomOnSelect.set(ev.target.checked)}
           ></input>
           <label>Zoom to cell nodes on select</label>
         </div>
         <div
           style={{
             width: '100%',
             padding: '10px',
             borderBottom: '1px solid grey',
             boxSizing: 'border-box'
           }}
         >
           <input
             style={{ marginRight: '10px' }}
             type={'checkbox'}
             defaultChecked={showLastExecute.value}
             onChange={ev => showLastExecute.set(ev.target.checked)}
           ></input>
           <label>Only show dependencies of the selected execution</label>
         </div>
         <div
           style={{
             width: '100%',
             padding: '10px',
             borderBottom: '1px solid grey',
             boxSizing: 'border-box'
           }}
         >
           <input
             style={{ marginRight: '10px' }}
             type={'checkbox'}
             defaultChecked={renderOnUpdate.value}
             onChange={ev => renderOnUpdate.set(ev.target.checked)}
           ></input>
           <label>Rebuild the graph automatically if new data is captured</label>
         </div>
         <div
           style={{
             width: '100%',
             padding: '10px',
             boxSizing: 'border-box'
           }}
           onClick={() => {
             if (
               confirm(
                 'Are you sure you want to delete the collected provenance data for your notebook?\n\nIf so be sure that you exported the collected data first!'
               )
             ) {
               props.notebook.model.metadata.delete('provenance');
               props.notebook.context.save();
               props.menuToggle(false);
             } else {
             }
           }}
         >
           Remove provenance data in case notebook size is to big (export your
           data first)
         </div>
       </div>
     </div>
   );
 }
 
 interface InfoComponentReactProps {
   infoElements: Array<{ name: string; text: string }>;
   outputElement: string | undefined;
   cell: CellData;
   epoch: number;
 }
 
 export function InfoReactComponent(props: InfoComponentReactProps) {
   const toggleInfo = useHookstate([]);
   const toggleOutput = useHookstate(true);
 
   useEffect(() => {
     if (props.infoElements) toggleInfo.set(props.infoElements.map(el => true));
   }, []);
 
   if (props.cell) {
     return (
       <div
         style={{
           height: '100%',
           width: '100%',
           boxSizing: 'border-box',
           overflowY: 'auto'
         }}
       >
         <div
           style={{
             width: '100%',
             boxSizing: 'border-box',
             borderBottom: '1px solid grey'
           }}
         >
           <div
             style={{
               width: '100%',
               boxSizing: 'border-box',
               padding: '10px',
               backgroundColor: 'rgba(0, 0, 0, 0.05)'
             }}
           >
             Execution info of execution <b> {props.cell.execution_count} </b> at
             epoch <b> {props.epoch} </b>
           </div>
         </div>
         {toggleInfo.length != 0
           ? props.infoElements.map((el, i) => {
               return (
                 <div
                   style={{
                     width: '100%',
                     boxSizing: 'border-box',
                     borderBottom:
                       toggleInfo.length - 1 == i ? '1px solid grey' : ''
                   }}
                   key={i}
                 >
                   <div
                     style={{
                       width: '100%',
                       boxSizing: 'border-box',
                       padding: '10px',
                       borderTop: i == 0 ? '' : '1px solid grey',
                       borderBottom: !toggleInfo[i].value
                         ? '1px dotted grey'
                         : ''
                     }}
                     onClick={() => {
                       toggleInfo[i].set(!toggleInfo[i].value);
                     }}
                   >
                     Definition info: <b> {el.name} </b>
                   </div>
                   <div
                     style={{
                       width: '100%',
                       boxSizing: 'border-box',
                       padding: '10px',
                       display: toggleInfo[i].value ? 'none' : 'initial'
                     }}
                     dangerouslySetInnerHTML={{ __html: el.text }}
                   ></div>
                 </div>
               );
             })
           : null}
         {props.outputElement ? (
           <div
             style={{
               width: '100%',
               boxSizing: 'border-box',
               borderBottom: '1px solid grey'
             }}
           >
             <div
               style={{
                 width: '100%',
                 boxSizing: 'border-box',
                 padding: '10px',
                 borderBottom: !toggleOutput.value ? '1px dotted grey' : ''
               }}
               onClick={() => {
                 toggleOutput.set(!toggleOutput.value);
               }}
             >
               <b>Cell output</b>
             </div>
             <div
               style={{
                 width: '100%',
                 boxSizing: 'border-box',
                 padding: '10px',
                 display: toggleOutput.value ? 'none' : 'initial'
               }}
               dangerouslySetInnerHTML={{ __html: props.outputElement }}
             ></div>
           </div>
         ) : null}
       </div>
     );
   } else {
     return <div></div>;
   }
 }
 
 interface NotebookComponentReactProps {
   notebookPanel: NotebookPanel;
 }
 
 export function NotebookReactComponent(props: NotebookComponentReactProps) {
   //@ts-ignore
   const [codes, setCodes] = useState([]);
   const localSliderValues = useHookstate(sliderValues[props.notebookPanel.id]);
   const localDisplayedExecutions = useHookstate(
     displayedExecutions[props.notebookPanel.id]
   );
   const [outputRenders, outputRendersSet] = useState([]);
 
   useEffect(() => {
     //@ts-ignore
     var data: ProvenanceData =
       props.notebookPanel.context.model.metadata.toJSON()['provenance'];
 
     var epoch = data.epochs[localSliderValues.get().epoch.value];
 
     var list: Array<any> = [];
     var outputList: Array<any> = [];
 
     if (Array.isArray(localDisplayedExecutions.get())) {
       localDisplayedExecutions.get().forEach((element: any) => {
         for (
           let index = 0;
           index <= localSliderValues.get().cell.value;
           index++
         ) {
           const cell = epoch.data[index];
           if (cell.execution_count == element) {
             list.push({
               source: cell.cell_source.toString(),
               execution: element
             });
 
             if (cell.cell_outputs.length != 0) {
               let output = new SimplifiedOutputArea({
                 model: new OutputAreaModel({ values: cell.cell_outputs }),
                 rendermime: rendermimeInstanceGet()
               }).node.outerHTML;
               outputList.push(output);
             } else {
               outputList.push(null);
             }
 
             break;
           }
         }
       });
       setCodes(list);
       outputRendersSet(outputList);
     }
 
     //@ts-ignore
   }, [localSliderValues.get().epoch.value, localSliderValues.get().cell.value]);
 
   return (
     <div
       style={{
         width: '100%',
         height: '100%',
         overflowY: 'auto',
         margin: '0px'
       }}
     >
       {codes.map((el, i) => {
         return (
           <React.Fragment>
             <div
               style={{
                 width: '100%',
                 padding: '10px',
                 boxSizing: 'border-box'
               }}
             >
               <p>
                 <b>Execution {el.execution}</b>
               </p>
             </div>
             <SyntaxHighlighter
               key={i}
               language="python"
               customStyle={{ margin: '0px' }}
             >
               {el.source}
             </SyntaxHighlighter>
             {outputRenders[i] ? (
               <div dangerouslySetInnerHTML={{ __html: outputRenders[i] }}></div>
             ) : null}
           </React.Fragment>
         );
       })}
     </div>
   );
 }
 
 interface GeneralMenuReactProps {
   notebook: NotebookPanel;
 }
 
 export function GeneralMenuReact(props: GeneralMenuReactProps) {
   //@ts-ignore
   const [sources, setSources] = useState([]);
   const localSliderValues = useHookstate(sliderValues[props.notebook.id]);
 
   useEffect(() => {
     //@ts-ignore
     var data: ProvenanceData =
       props.notebook.context.model.metadata.toJSON()['provenance'];
 
     var list: Array<any> = [];
 
     data.epochs[localSliderValues.get().epoch.value].data.forEach(cell => {
       if (cell.data_values.length != 0) {
         cell.data_values.forEach((value, i) => {
           list.push({
             execution: cell.execution_count,
             variable: cell.data_vars[i],
             source: value
           });
         });
       }
     });
 
     setSources(list);
 
     //@ts-ignore
   }, [localSliderValues.get().epoch.value]);
 
   return (
     <div
       style={{
         width: '100%',
         maxHeight: '400px',
         overflowY: 'auto'
       }}
     >
       {sources.map((source, i) => {
         return (
           <div
             style={{
               boxSizing: 'border-box',
               width: '100%',
               padding: '10px',
               borderBottom: i == source.length - 1 ? '1px solid grey' : ''
             }}
           >
             Source <b>{source.source}</b> was first used in execution{' '}
             <b>{source.execution}</b> in variable <b>{source.variable}</b>
           </div>
         );
       })}
     </div>
   );
 }
 