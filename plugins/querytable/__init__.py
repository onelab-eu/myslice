from unfold.plugin import Plugin

class QueryTable (Plugin):

    # set checkboxes if a final column with checkboxes is desired
    # pass columns as the initial set of columns
    #   if None then this is taken from the query's fields
    # also please refrain from passing an 'aoColumns' as datatables_options
    # as we use 'aoColumnDefs' instead
    def __init__ (self, query=None, query_all=None, 
                  checkboxes=False, columns=None, 
                  datatables_options={}, **settings):
        Plugin.__init__ (self, **settings)
        self.query          = query
        # Until we have a proper way to access queries in Python
        self.query_all      = query_all
        self.query_all_uuid = query_all.query_uuid if query_all else None
        self.checkboxes     = checkboxes
        # XXX We need to have some hidden columns until we properly handle dynamic queries
        if columns is not None:
            self.columns=columns
            self.hidden_columns = []
        elif self.query:
            self.columns = self.query.fields
            if query_all:
                # We need a list because sets are not JSON-serializable
                self.hidden_columns = list(self.query_all.fields - self.query.fields)
            else:
                self.hidden_columns = []
        else:
            self.columns = []
            self.hidden_columns = []
        self.datatables_options=datatables_options
        # if checkboxes were required, we tell datatables about this column's type
        # so that sorting can take place on a selected-first basis (or -last of course)
        # this relies on the template exposing the checkboxes 'th' with class 'checkbox'
        if self.checkboxes:
            # we use aoColumnDefs rather than aoColumns -- ignore user-provided aoColumns
            if 'aoColumns' in self.datatables_options:
                print 'WARNING: querytable uses aoColumnDefs, your aoColumns spec. is discarded'
                del self.datatables_options['aoColumns']
            # set aoColumnDefs in datatables_options - might already have stuff in there
            aoColumnDefs = self.datatables_options.setdefault ('aoColumnDefs',[])
            # here 'checkbox' is the class that we give to the <th> dom elem
            # dom-checkbox is a sorting type that we define in querytable.js
            aoColumnDefs.append ( {'aTargets': ['checkbox'], 'sSortDataType': 'dom-checkbox' } )

    def template_file (self):
        return "querytable.html"

    def template_env (self, request):
        env={}
        env.update(self.__dict__)
        env['columns']=self.columns
        return env

    def requirements (self):
        reqs = {
            'js_files' : [ "js/spin.presets.js", "js/spin.min.js", "js/jquery.spin.js", 
                           "js/dataTables.js", "js/dataTables.bootstrap.js", "js/with-datatables.js",
                           "js/manifold.js", "js/manifold-query.js", 
                           "js/unfold-helper.js",
                          # querytable.js needs to be loaded after dataTables.js as it extends 
                          # dataTableExt.afnSortData
                           "js/querytable.js", 
                           ] ,
            'css_files': [ "css/dataTables.bootstrap.css",
                           # hopefully temporary, when/if datatables supports sPaginationType=bootstrap3
                           # for now we use full_numbers, with our own ad hoc css 
                           "css/dataTables.full_numbers.css",
                           "css/querytable.css" , 
                           ],
            }
        return reqs

    # the list of things passed to the js plugin
    def json_settings_list (self):
        return ['plugin_uuid', 'domid', 
                'query_uuid', 'query_all_uuid', 
                'checkboxes', 'datatables_options', 
                'hidden_columns']