import json
import difflib

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado
from . import analyze


class RouteHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({
            "data": "This is /mlprovlab/get_example endpoint!"
        }))


class CodeAnalyzeRoute(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def post(self):
        code = tornado.escape.json_decode(self.request.body)
        definitions ,local_vars, remote_vars, imports, modules, data_vars, data_values = analyze.analyze(
            code)
        self.finish(json.dumps({
            "definitions": definitions,
            "local": local_vars,
            "remote": remote_vars,
            "imports": imports,
            "modules": modules,
            "data_vars": data_vars,
            "data_values": data_values
        }))


class CodeDiffRoute(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def post(self):
        data = tornado.escape.json_decode(self.request.body)
        if "current" in data and "old" in data:
            diff = difflib.ndiff(data["current"].splitlines(
                keepends=True), data["old"].splitlines(keepends=True))
            self.finish(json.dumps(''.join(diff)))
        self.set_status(400)
        self.finish()


def setup_handlers(web_app):
    host_pattern = ".*$"

    base_url = web_app.settings["base_url"]
    route_pattern = url_path_join(
        base_url, "mlprovlab", "get_example")
    analyze_pattern = url_path_join(
        base_url, "mlprovlab", "analyze")
    diff_code = url_path_join(
        base_url, "mlprovlab", "diff")
    handlers = [(route_pattern, RouteHandler),
                (analyze_pattern, CodeAnalyzeRoute),
                (diff_code, CodeDiffRoute)]
    web_app.add_handlers(host_pattern, handlers)
