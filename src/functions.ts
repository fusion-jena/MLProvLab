import { NotebookPanel } from '@jupyterlab/notebook';

import { ProvenanceData } from './interfaces';

export function exportProvenance(notebook: NotebookPanel): string {
  //@ts-ignore
  var prov_data: ProvenanceData =
    notebook.context.model.metadata.toJSON()['provenance'];
  var prov_export: { used_data: Array<string>; epochs: Array<any> } = {
    used_data: [],
    epochs: []
  };
  for (let indexEpoch = 0; indexEpoch < prov_data.epochs.length; indexEpoch++) {
    const epoch = prov_data.epochs[indexEpoch];
    var newEpoch: any = {
      kernel_start_time: epoch.environment.time,
      language: epoch.environment.language_info.name,
      language_version: epoch.environment.language_info.version,
      language_mimetype: epoch.environment.language_info.mimetype,
      kernel: epoch.environment.kernel.implementation,
      kernel_version: epoch.environment.kernel.version,
      user_agent: epoch.environment.user_agent,
      modules: epoch.modules,
      execution_data: []
    };
    for (let indexCell = 0; indexCell < epoch.data.length; indexCell++) {
      const cell = epoch.data[indexCell];
      cell.data_values.forEach(el =>
        prov_export.used_data.includes(el)
          ? null
          : prov_export.used_data.push(el)
      );
      var newCell: any = {
        execution_count: cell.execution_count,
        used_data: cell.data_values,
        data_vars: cell.data_vars,
        execution_info: cell.definitions,
        code: cell.cell_source,
        cell_id: cell.cell_id,
        dependencies: cell.remote,
        imports: cell.imports,
        outputs: cell.cell_outputs,
        definitions: cell.local,
        definition_info: cell.local_info,
        time: cell.time
      };
      newEpoch.execution_data.push(newCell);
    }
    prov_export.epochs.push(newEpoch);
  }

  return JSON.stringify(prov_export);
}

export function download(filename: string, text: string) {
  var element = document.createElement('a');
  element.setAttribute(
    'href',
    'data:text/plain;charset=utf-8,' + encodeURIComponent(text)
  );
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}
