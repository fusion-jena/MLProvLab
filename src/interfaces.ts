import { MultilineString } from '@jupyterlab/nbformat';
//import { PartialJSONValue } from '@lumino/coreutils';

export interface Dictionary<T> {
  [Key: string]: T;
}

export interface ProvenanceData {
  epochs: {
    modules: Dictionary<any>;
    data: Array<CellData>;
    cells: string[];
    environment: {
      time: string;
      user_agent: string;
      kernel: { implementation: string; version: string };
      language_info: { name: string; version: string; mimetype: string };
    };
  }[];
  cells: string[];
}

export interface Definition {
  name: string;
  type: string;
  lineno: number;
  col_offset: number;
  end_col_offset: number;
  end_lineno: number;
  dependencies: Array<string>;
}

export interface BodyDefinition {
  name: string;
  type: string;
  lineno: number;
  col_offset: number;
  end_col_offset: number;
  end_lineno: number;
  dependencies: Array<string>;
  body: Array<Definition | BodyDefinition>;
  orelse: Array<Definition | BodyDefinition>;
}

export interface CellData {
  cell_id: string;
  cell_source: MultilineString;
  cell_outputs: Array<any>;
  execution_count: number;
  definitions: Array<Definition | BodyDefinition>;
  local: string[];
  remote: string[];
  imports: string[];
  local_info: {};
  data_vars: string[];
  data_values: string[];
  time: string;
  type: 'error' | 'execution';
}
