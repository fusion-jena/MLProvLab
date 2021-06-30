import ast
import os
import re
import sys
import pkg_resources


def analyze(code: str):
    definitions = []
    local_vars: list[str] = []
    remote_vars: list[str] = []
    imports: list[str] = []
    modules: dict = {}
    data_values = []
    data_vars = []
    data_lines = []
    error_count = 0
    while(True):
        if error_count >= 1000:
            break
        try:
            analyze_ast(ast.parse(code, "<string>", mode='exec'),
                        definitions, local_vars, remote_vars, imports, modules)

            check_files(ast.parse(code, "<string>", mode='exec'),
                        data_lines, data_values)
            check_files_vars(definitions, data_lines, data_vars)
            break
        except SyntaxError as error:
            error_count += 1
            code = code.replace(error.text, "")
            print(error.text)
        except:
            break

    return definitions, local_vars, remote_vars, imports, modules, data_vars, data_values


def get_vars(element, list_vars):
    if hasattr(element, "id"):
        # Check if var is in current context or not and add it if not
        if element.id not in list_vars:
            list_vars.append(element.id)
    elif hasattr(element, '__dict__'):
        # Check all keys furter to grab possible remote_vars
        for key, el in element.__dict__.items():
            get_vars(el, list_vars)
    elif hasattr(element, '__iter__') and not isinstance(element, str):
        # Check all items in a list furter to grab possible remote_vars
        for el in element:
            get_vars(el, list_vars)
            
def get_vars_storage(element, list_vars):
    if hasattr(element, "id"):
        # Check if var is in current context or not and add it if not
        if element.id not in list_vars and isinstance(element.ctx, ast.Store):
            list_vars.append(element.id)
    elif hasattr(element, '__dict__'):
        # Check all keys furter to grab possible remote_vars
        for key, el in element.__dict__.items():
            get_vars_storage(el, list_vars)
    elif hasattr(element, '__iter__') and not isinstance(element, str):
        # Check all items in a list furter to grab possible remote_vars
        for el in element:
            get_vars_storage(el, list_vars)


def get_args(element, list_vars):
    if hasattr(element, "arg"):
        # Check if var is in current context or not and add it if not
        if element.arg not in list_vars:
            list_vars.append(element.arg)
    elif hasattr(element, '__dict__'):
        # Check all keys furter to grab possible remote_vars
        for key, el in element.__dict__.items():
            get_vars(el, list_vars)
    elif hasattr(element, '__iter__') and not isinstance(element, str):
        # Check all items in a list furter to grab possible remote_vars
        for el in element:
            get_vars(el, list_vars)


def analyze_ast(element, definitions: list, local_vars: list[str],  remote_vars: list[str], imports: list, modules: dict):
    if isinstance(element, ast.FunctionDef) or isinstance(element, ast.AsyncFunctionDef):
        element: ast.FunctionDef
        if element.name not in local_vars:
            local_vars.append(element.name)
        def_vars = []
        get_vars(element.args, def_vars)
        def_args = local_vars.copy()
        get_args(element.args, def_args)

        # Analyze the body of the function
        analyze_ast(element.body, [], def_args, def_vars, imports, modules)

        # Check if new remotes are used (local_vars inside the function are not tracked because they
        # cant be called outside and can only be defined in one notebook cell)
        for var in def_vars:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        definitions.append({"name": element.name, "type": "function", "dependencies": def_vars, "lineno": element.lineno,
                            "end_lineno": element.end_lineno, "col_offset": element.col_offset, "end_col_offset": element.end_col_offset})
    elif isinstance(element, ast.ClassDef):
        element: ast.ClassDef
        if element.name not in local_vars:
            local_vars.append(element.name)
        def_vars = []
        get_vars(element.bases, def_vars)
        get_vars(element.keywords, def_vars)
        get_vars(element.decorator_list, def_vars)
        def_args = local_vars.copy()

        # Analyze the body of the class
        analyze_ast(element.body, [], def_args, def_vars, imports, modules)

        # Check if new remotes are used (variables and functions inside the class are not tracked because they
        # cant be called outside without specifing the class and can only be defined in one notebook cell)
        for var in def_vars:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        definitions.append({"name": element.name, "type": "class", "dependencies": def_vars, "lineno": element.lineno,
                            "end_lineno": element.end_lineno, "col_offset": element.col_offset, "end_col_offset": element.end_col_offset})
    elif isinstance(element, ast.For) or isinstance(element, ast.AsyncFor):
        element: ast.For
        # We somehow need to track loops but this is hard because we cant request the notebook kernel
        # to give us information about how often or if even the loop was executed
        # because of this we will specify it as a special wrapper containing the same data as a module
        vars_target = local_vars.copy()
        get_vars(element.target, vars_target)
        vars_iter = []
        get_vars(element.iter, vars_iter)

        # check if iter is defined in cell
        for var in vars_iter:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        # analyze the body
        body_def = []
        body_remote_vars = []
        analyze_ast(element.body, body_def, vars_target,
                    body_remote_vars, imports, modules)
        for var in body_remote_vars:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        # analyze orelse
        orelse_def = []
        orelse_remote_vars = []
        analyze_ast(element.orelse, orelse_def, vars_target,
                    orelse_remote_vars, imports, modules)
        for var in orelse_remote_vars:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        for var in vars_target:
            if var not in local_vars:
                local_vars.append(var)

        dependencies = []
        dependencies.extend(x for x in vars_iter if x not in dependencies)
        dependencies.extend(
            x for x in body_remote_vars if x not in dependencies)
        dependencies.extend(
            x for x in orelse_remote_vars if x not in dependencies)

        definitions.append({"type": "loop", "lineno": element.lineno,
                            "end_lineno": element.end_lineno, "col_offset": element.col_offset, "end_col_offset": element.end_col_offset,
                            "body": body_def, "orelse": orelse_def, "dependencies": dependencies})
    elif isinstance(element, ast.While):
        element: ast.While
        # Same as for loops but with fewer args
        vars_iter = []
        get_vars(element.test, vars_iter)

        # check if iter is defined in cell
        for var in vars_iter:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        # analyze the body
        body_def = []
        body_remote_vars = []
        analyze_ast(element.body, body_def, local_vars,
                    body_remote_vars, imports, modules)
        for var in body_remote_vars:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        # analyze orelse
        orelse_def = []
        orelse_remote_vars = []
        analyze_ast(element.orelse, orelse_def, local_vars,
                    orelse_remote_vars, imports, modules)
        for var in body_remote_vars:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        dependencies = []
        dependencies.extend(x for x in vars_iter if x not in dependencies)
        dependencies.extend(
            x for x in body_remote_vars if x not in dependencies)
        dependencies.extend(
            x for x in orelse_remote_vars if x not in dependencies)

        definitions.append({"type": "loop", "lineno": element.lineno,
                            "end_lineno": element.end_lineno, "col_offset": element.col_offset, "end_col_offset": element.end_col_offset,
                            "body": body_def, "orelse": orelse_def, "dependencies": dependencies})
    elif isinstance(element, ast.If) or isinstance(element, ast.IfExp):
        element: ast.If
        # The same for loops applies also to if blocks
        # because we will never now if they got executed, we will add them as a special block
        vars_iter = []
        get_vars(element.test, vars_iter)

        # check if iter is defined in cell
        for var in vars_iter:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        # analyze the body
        body_def = []
        body_remote_vars = []
        analyze_ast(element.body, body_def, local_vars,
                    body_remote_vars, imports, modules)
        for var in body_remote_vars:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        # analyze orelse
        orelse_def = []
        orelse_remote_vars = []
        analyze_ast(element.orelse, orelse_def, local_vars,
                    orelse_remote_vars, imports, modules)
        for var in body_remote_vars:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)

        dependencies = []
        dependencies.extend(x for x in vars_iter if x not in dependencies)
        dependencies.extend(
            x for x in body_remote_vars if x not in dependencies)
        dependencies.extend(
            x for x in orelse_remote_vars if x not in dependencies)

        definitions.append({"type": "condition", "lineno": element.lineno,
                            "end_lineno": element.end_lineno, "col_offset": element.col_offset, "end_col_offset": element.end_col_offset,
                            "body": body_def, "orelse": orelse_def, "dependencies": dependencies})
    elif isinstance(element, ast.Import) or isinstance(element, ast.ImportFrom):
        element: ast.Import
        # Wee need to handle imports sepperate because they will fill up the graph
        # in the later visualization pretty quickly
        if hasattr(element, "module"):
            if element.module not in modules:
                version = ""
                try:
                    version = pkg_resources.get_distribution(
                        element.module).version
                except:
                    pass
                modules[element.module] = {'imports': [], 'version': version}
            for name in element.names:
                if name.asname != None:
                    imports.append(name.asname)
                    modules[element.module]["imports"].append(
                        {"name": name.name, "alias": name.asname})
                else:
                    imports.append(name.name)
                    modules[element.module]["imports"].append(name.name)
        else:
            for name in element.names:
                version = ""
                try:
                    version = pkg_resources.get_distribution(name.name).version
                except:
                    pass
                if name.asname != None:
                    imports.append(name.asname)
                    if name.asname not in modules:
                        modules[name.name] = {
                            "alias": name.asname, 'version': version}
                else:
                    imports.append(name.name)
                    modules[name.name] = {'version': version}
    elif isinstance(element, ast.Assign):
        element: ast.Assign
        # Handle assign with unpacking
        if isinstance(element.targets[0], ast.Tuple) or isinstance(element.targets[0], ast.List):
            found_local_vars = []
            get_vars_storage(element.targets, found_local_vars)
            for found in found_local_vars:
                if found not in local_vars:
                    local_vars.append(found)
            dependencies = []
            if isinstance(element.value, ast.Tuple) or isinstance(element.value, ast.List):
                for elts in element.value.elts:
                    dep_vars = []
                    get_vars(elts, dep_vars)
                    dependencies.append(dep_vars)
            else:
                dep_vars = []
                get_vars(element.value, dep_vars)
                for found in found_local_vars:
                    dependencies.append(dep_vars)
            for i, found in enumerate(found_local_vars):
                for var in dependencies[i]:
                    if var not in local_vars and var not in remote_vars and var not in imports:
                        remote_vars.append(var)
                definitions.append({"name": found, "type": "assign", "dependencies": dependencies[i], "lineno": element.lineno,
                                    "end_lineno": element.end_lineno, "col_offset": element.col_offset, "end_col_offset": element.end_col_offset})
        # Handle normal assign
        # Multiple targets means that each one gets same value
        else:
            found_local_vars = []
            get_vars_storage(element.targets, found_local_vars)
            dependencies = []
            get_vars(element.value, dependencies)
            for var in dependencies:
                if var not in local_vars and var not in remote_vars and var not in imports:
                    remote_vars.append(var)
            for found in found_local_vars:
                if found not in local_vars:
                    local_vars.append(found)
                definitions.append({"name": found, "type": "assign", "dependencies": dependencies, "lineno": element.lineno,
                                    "end_lineno": element.end_lineno, "col_offset": element.col_offset, "end_col_offset": element.end_col_offset})
    elif isinstance(element, ast.AugAssign) or isinstance(element, ast.AnnAssign):
        element: ast.AugAssign
        found_local_vars = []
        get_vars_storage(element.target, found_local_vars)
        dependencies = []
        get_vars(element.value, dependencies)
        for var in dependencies:
            if var not in local_vars and var not in remote_vars and var not in imports:
                remote_vars.append(var)
        for found in found_local_vars:
            if found not in local_vars:
                local_vars.append(found)
            definitions.append({"name": found, "type": "assign", "dependencies": dependencies, "lineno": element.lineno,
                                "end_lineno": element.end_lineno, "col_offset": element.col_offset, "end_col_offset": element.end_col_offset})
    elif isinstance(element, ast.Expr) and isinstance(element.value, ast.Call):
        element: ast.Expr
        # Look for expressions where for example a model is trained
        expr_remote_vars = []
        analyze_ast(element.value, [], [], expr_remote_vars, imports, modules)

        if len(expr_remote_vars) >= 1:
            dependencies = []
            if len(expr_remote_vars) >= 2:
                dependencies = expr_remote_vars[1:]
                for var in expr_remote_vars:
                    if var not in local_vars and var not in remote_vars and var not in imports:
                        remote_vars.append(var)
            definitions.append({"name": expr_remote_vars[0], "type": "call", "dependencies": dependencies, "lineno": element.lineno,
                                "end_lineno": element.end_lineno, "col_offset": element.col_offset, "end_col_offset": element.end_col_offset})

    elif hasattr(element, "body"):
        # Everything with a body thats not tracked before is a module or somthing similar
        analyze_ast(element.body, definitions,
                    local_vars, remote_vars, imports, modules)
    elif hasattr(element, "id"):
        # Check if var is in current context or not and add it if not
        if element.id not in local_vars and element.id not in remote_vars:
            remote_vars.append(element.id)
    elif hasattr(element, '__dict__'):
        # Check all keys furter to grab possible remote_vars
        for key, el in element.__dict__.items():
            analyze_ast(el, definitions, local_vars,
                        remote_vars, imports, modules)
    elif hasattr(element, '__iter__') and not isinstance(element, str):
        # Check all items in a list furter to grab possible remote_vars
        for el in element:
            analyze_ast(el, definitions, local_vars,
                        remote_vars, imports, modules)


def check_files(element: ast.stmt, lines: list[int], data: list[str]):
    if hasattr(element, 'value'):
        try:
            if re.search(r"((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)", element.value) != None:
                data.append(element.value)
                lines.append([element.lineno, element.end_lineno])
            elif os.path.isdir(element.value) or os.path.isfile(element.value):
                data.append(element.value)
                lines.append([element.lineno, element.end_lineno])
        except:
            check_files(element.value, lines, data)
    elif hasattr(element, '__dict__'):
        for key, val in element.__dict__.items():
            check_files(val, lines, data)
    elif hasattr(element, '__iter__') and not isinstance(element, str):
        for val in element:
            check_files(val, lines, data)


def check_files_vars(definitions: list, lines: list[list[int]], def_vars: list[str]):
    for definition in definitions:
        if hasattr(definition, "body"):
            check_files_vars(definition.body, lines)
            check_files_vars(definition.orelse, lines)
        else:
            for line in lines:
                if line[0] <= definition["lineno"] and line[1] >= definition["end_lineno"]:
                    if definition["name"] not in def_vars:
                        def_vars.append(definition["name"])
                        del line
                    break
            for dep in definition["dependencies"]:
                if dep in def_vars and definition["name"]not in def_vars:
                    def_vars.append(definition["name"])
                    break
