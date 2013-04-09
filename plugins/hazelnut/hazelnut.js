/**
 * Description: display a query result in a datatables-powered <table>
 * Copyright (c) 2012 UPMC Sorbonne Universite - INRIA
 * License: GPLv3
 */

/*
 * It's a best practice to pass jQuery to an IIFE (Immediately Invoked Function
 * Expression) that maps it to the dollar sign so it can't be overwritten by
 * another library in the scope of its execution.
 */
(function($){

    var debug=false;
//    debug=true

    // routing calls
    $.fn.Hazelnut = function( method ) {
        if ( methods[method] ) {
            return methods[method].apply( this, Array.prototype.slice.call( arguments, 1 ));
        } else if ( typeof method === 'object' || ! method ) {
            return methods.init.apply( this, arguments );
        } else {
            $.error( 'Method ' +  method + ' does not exist on jQuery.Hazelnut' );
        }    
    };

    /***************************************************************************
     * Public methods
     ***************************************************************************/

    var methods = {

        init : function ( options ) {
            /* Default settings */
            var options = $.extend( {
                'checkboxes': false
            }, options);

            return this.each(function() {
                var $this = $(this);
                /* Events */
                $this.on('show.Datatables', methods.show);

                /* An object that will hold private variables and methods */
		var hazelnut = new Hazelnut (options);
                $this.data('Hazelnut', hazelnut);

                var query_channel   = '/query/' + options.query_uuid + '/changed';
                var update_channel  = '/update-set/' + options.query_uuid;
                var results_channel = '/results/' + options.query_uuid + '/changed';

                $.subscribe(query_channel,  function(e, query) { hazelnut.set_query(query); });
                $.subscribe(update_channel, function(e, resources, instance) { hazelnut.set_resources(resources, instance); });
                $.subscribe(results_channel, $this, function(e, rows) { hazelnut.update_plugin(e,rows); });
		if (debug) console.log("hazelnut '" + this.id + "' subscribed to e.g." + results_channel);

            }); // this.each
        }, // init

        destroy : function( ) {
            return this.each(function() {
                var $this = $(this);
                var hazelnut = $this.data('Hazelnut');

                // Unbind all events using namespacing
                $(window).unbind('Hazelnut');

                // Remove associated data
                hazelnut.remove();
                $this.removeData('Hazelnut');
            });
        }, // destroy

        show : function( ) {
	    var $this=$(this);
	    // xxx wtf. why [1] ? would expect 0...
	    if (debug) console.log("Hitting suspicious line in hazelnut.show");
            var oTable = $($('.dataTable', $this)[1]).dataTable();
            oTable.fnAdjustColumnSizing()
    
            /* Refresh dataTabeles if click on the menu to display it : fix dataTables 1.9.x Bug */        
            $(this).each(function(i,elt) {
                if (jQuery(elt).hasClass('dataTables')) {
                    var myDiv=jQuery('#hazelnut-' + this.id).parent();
                    if(myDiv.height()==0) {
                        var oTable=$('#hazelnut-' + this.id).dataTable();            
                        oTable.fnDraw();
                    }
                }
            });
        } // show

    }; // var methods;


    /***************************************************************************
     * Hazelnut object
     ***************************************************************************/
    function Hazelnut(options) {
        /* member variables */
        this.options = options;
	// xxx thierry : initialize this here - it was not, I expect this relied on set_query somehow..
        //this.current_query = null;
	this.current_query=manifold.find_query(this.options.query_uuid);
	if (debug) console.log("Hazelnut constructor: have set current_query -> " + this.current_query);
	this.query_update = null;
        this.current_resources = Array();

        var object = this;

        /* Transforms the table into DataTable, and keep a pointer to it */
	actual_options = {
            // Customize the position of Datatables elements (length,filter,button,...)
	    // we use a fluid row on top and another on the bottom, making sure we take 12 grid elt's each time
	    sDom: "<'row-fluid'<'span5'l><'span1'r><'span6'f>>t<'row-fluid'<'span5'i><'span7'p>>",
            sPaginationType: 'bootstrap',
            // Handle the null values & the error : Datatables warning Requested unknown parameter
            // http://datatables.net/forums/discussion/5331/datatables-warning-...-requested-unknown-parameter/p2
            aoColumnDefs: [{sDefaultContent: '',aTargets: [ '_all' ]}],
	    // WARNING: this one causes tables in a 'tabs' that are not exposed at the time this is run to show up empty
            // sScrollX: '100%',       /* Horizontal scrolling */
            bProcessing: true,      /* Loading */
            fnDrawCallback: function() { hazelnut_draw_callback.call(object, options); }
        };
	// the intention here is that options.datatables_options as coming from the python object take precedence
	$.extend(actual_options, options.datatables_options );
        this.table = $('#hazelnut-' + options.plugin_uuid).dataTable(actual_options);

        /* Setup the SelectAll button in the dataTable header */
	/* xxx not sure this is still working */
        var oSelectAll = $('#datatableSelectAll-'+ options.plugin_uuid);
        oSelectAll.html("<span class='ui-icon ui-icon-check' style='float:right;display:inline-block;'></span>Select All");
        oSelectAll.button();
        oSelectAll.css('font-size','11px');
        oSelectAll.css('float','right');
        oSelectAll.css('margin-right','15px');
        oSelectAll.css('margin-bottom','5px');
        oSelectAll.unbind('click');
        oSelectAll.click(selectAll);

        /* Add a filtering function to the current table 
         * Note: we use closure to get access to the 'options'
         */
        $.fn.dataTableExt.afnFiltering.push(function( oSettings, aData, iDataIndex ) { 
            /* No filtering if the table does not match */
            if (oSettings.nTable.id != "hazelnut-" + options.plugin_uuid)
                return true;
            return hazelnut_filter.call(object, oSettings, aData, iDataIndex);
        });

        /* methods */

        this.set_query = function(query) {
            var options = this.options;
            /* Compare current and advertised query to get added and removed fields */
            previous_query = this.current_query;
            /* Save the query as the current query */
            this.current_query = query;
	    if (debug) console.log("hazelnut.set_query, current_query is now -> " + this.current_query);
            /* We check all necessary fields : in column editor I presume XXX */
            // XXX ID naming has no plugin_uuid
            if (typeof(query.fields) != 'undefined') {        
                $.each (query.fields, function(index, value) { 
                    if (!$('#hazelnut-checkbox-' + options.plugin_uuid + "-" + value).attr('checked'))
                        $('#hazelnut-checkbox-' + options.plugin_uuid + "-" + value).attr('checked', true);
                });
            }
            /*Process updates in filters / current_query must be updated before this call for filtering ! */
            this.table.fnDraw();

            /*
             * Process updates in fields
             */
            if (typeof(query.fields) != 'undefined') {     
                /* DataTable Settings */
                var oSettings = this.table.dataTable().fnSettings();
                var cols = oSettings.aoColumns;
                var colnames = cols.map(function(x) {return x.sTitle});
                colnames = $.grep(colnames, function(value) {return value != "+/-";});

                if (previous_query == null) {
                    var added_fields = query.fields;
                    var removed_fields = colnames;            
                    removed_fields = $.grep(colnames, function(x) { return $.inArray(x, added_fields) == -1});
                } else {
                    var tmp = previous_query.diff_fields(query);
                    var added_fields = tmp.added;
                    var removed_fields = tmp.removed;
                }

                /* Hide/unhide columns to match added/removed fields */
                var object = this;
                $.each(added_fields, function (index, field) {            
                    var index = object.getColIndex(field,cols);
                    if(index != -1)
                        object.table.fnSetColumnVis(index, true);
                });
                $.each(removed_fields, function (index, field) {
                    var index = object.getColIndex(field,cols);
                    if(index != -1)
                        object.table.fnSetColumnVis(index, false);
                });            
            }
        }

        this.set_resources = function(resources, instance) {
	    if (debug) console.log("entering hazelnut.set_resources");
            var options = this.options;
            var previous_resources = this.current_resources;
            this.current_resources = resources;
    
            /* We uncheck all checkboxes ... */
            $('hazelnut-checkbox-' + options.plugin_uuid).attr('checked', false);
            /* ... and check the ones specified in the resource list */
            $.each(this.current_resources, function(index, urn) {
                $('#hazelnut-checkbox-' + options.plugin_uuid + "-" + urn).attr('checked', true)
            });
            
        }

        /**
         * @brief Determine index of key in the table columns 
         * @param key
         * @param cols
         */
        this.getColIndex = function(key, cols) {
            var tabIndex = $.map(cols, function(x, i) { if (x.sTitle == key) return i; });
            return (tabIndex.length > 0) ? tabIndex[0] : -1;
        }
    
        /**
         * @brief
         * XXX will be removed/replaced
         */
        this.selected_changed = function(e, change) {
	    if (debug) console.log("entering hazelnut.selected_changed");
            var actions = change.split("/");
            if (actions.length > 1) {
                var oNodes = this.table.fnGetNodes();
                var myNode = $.grep(oNodes, function(value) {
                    if (value.id == actions[1]) { return value; }
                });                
                if( myNode.length>0 ) {
                    if ((actions[2]=="add" && actions[0]=="cancel") || actions[0]=="del")
                        checked='';
                    else
                        checked="checked='checked' ";
                    var newValue = this.checkbox(actions[1], 'node', checked, false);
                    var columnPos = this.table.fnSettings().aoColumns.length - 1;
                    this.table.fnUpdate(newValue, myNode[0], columnPos);
                    this.table.fnDraw();
                }
            }
        }
    
        this.update_plugin = function(e, rows) {
	    // e.data is what we passed in second argument to subscribe
	    // so here it is the jquery object attached to the plugin <div>
	    var $plugindiv=e.data;
	    if (debug) console.log("entering hazelnut.update_plugin on id '" + $plugindiv.attr('id') + "'");
	    // clear the spinning wheel: look up an ancestor that has the need-spin class
	    // do this before we might return
	    $plugindiv.closest('.need-spin').spin(false);

            var options = this.options;
            var hazelnut = this;
    
            if (rows.length==0) {
		if (debug) console.l ("empty result");
                this.table.html(unfold.errorDisplay("No Result"));   
                return;
            } else if (typeof(rows[0].error) != 'undefined') {
		if (debug) console.log ("undefined result");
                this.table.html(unfold.errorDisplay(rows[0].error));
                return;
            }
            newlines = new Array();
    
            this.current_resources = Array();
    
            $.each(rows, function(index, obj) {
                newline = new Array();
    
                // go through table headers to get column names we want
                // in order (we have temporarily hack some adjustments in names)
                var cols = hazelnut.table.fnSettings().aoColumns;
                var colnames = cols.map(function(x) {return x.sTitle})
                var nb_col = colnames.length;
                if (options.checkboxes)
                    nb_col -= 1;
                for (var j = 0; j < nb_col; j++) {
                    if (typeof colnames[j] == 'undefined') {
                        newline.push('...');
                    } else if (colnames[j] == 'hostname') {
                        if (obj['type'] == 'resource,link')
                            //TODO: we need to add source/destination for links
                            newline.push('');
                        else
                            newline.push(obj['hostname']);
                    } else {
                        if (obj[colnames[j]])
                            newline.push(obj[colnames[j]]);
                        else
                            newline.push('');
                    }
                }
    
                if (options.checkboxes) {
                    var checked = '';
                    if (typeof(obj['sliver']) != 'undefined') { /* It is equal to null when <sliver/> is present */
                        checked = 'checked ';
                        hazelnut.current_resources.push(obj['urn']);
                    }
                    // Use a key instead of hostname (hard coded...)
                    newline.push(hazelnut.checkbox(options.plugin_uuid, obj['urn'], obj['type'], checked, false));
                }
    
                newlines.push(newline);
    
    
            });
    
	    this.table.fnClearTable();
	    if (debug) console.log("hazelnut.update_plugin: total of " + newlines.length + " rows");
            this.table.fnAddData(newlines);
    
        };

        this.checkbox = function (plugin_uuid, header, field, selected_str, disabled_str) {
	    var result="";
            /* Prefix id with plugin_uuid */
	    result += "<input class='hazelnut-checkbox-" + plugin_uuid + "' id='hazelnut-checkbox-" + plugin_uuid + "-" + unfold.get_value(header) + "'";
	    result += " name='" + unfold.get_value(field) + "' type='checkbox' " + selected_str + disabled_str + " autocomplete='off' value='" + unfold.get_value(header) + "'";
	    result +="></input>";
	    return result;
        };
    } // constructor

    /***************************************************************************
     * Private methods
     * xxx I'm not sure why this should not be methods in the Hazelnut class above
     ***************************************************************************/

    /** 
     * @brief Hazelnut filtering function
     */
    function hazelnut_filter (oSettings, aData, iDataIndex) {
        var cur_query = this.current_query;
        var ret = true;

        /* We have an array of filters : a filter is an array (key op val) 
         * field names (unless shortcut)    : oSettings.aoColumns  = [ sTitle ]
         *     can we exploit the data property somewhere ?
         * field values (unless formatting) : aData
         *     formatting should leave original data available in a hidden field
         *
         * The current line should validate all filters
         */
        $.each (cur_query.filters, function(index, filter) { 
            /* XXX How to manage checkbox ? */
            var key = filter[0]; 
            var op = filter[1];
            var value = filter[2];

            /* Determine index of key in the table columns */
            var col = $.map(oSettings.aoColumns, function(x, i) {if (x.sTitle == key) return i;})[0];

            /* Unknown key: no filtering */
            if (typeof(col) == 'undefined')
                return;

            col_value=unfold.get_value(aData[col]);
            /* Test whether current filter is compatible with the column */
            if (op == '=' || op == '==') {
                if ( col_value != value || col_value==null || col_value=="" || col_value=="n/a")
                    ret = false;
            }else if (op == '!=') {
                if ( col_value == value || col_value==null || col_value=="" || col_value=="n/a")
                    ret = false;
            } else if(op=='<') {
                if ( parseFloat(col_value) >= value || col_value==null || col_value=="" || col_value=="n/a")
                    ret = false;
            } else if(op=='>') {
                if ( parseFloat(col_value) <= value || col_value==null || col_value=="" || col_value=="n/a")
                    ret = false;
            } else if(op=='<=' || op=='≤') {
                if ( parseFloat(col_value) > value || col_value==null || col_value=="" || col_value=="n/a")
                    ret = false;
            } else if(op=='>=' || op=='≥') {
                if ( parseFloat(col_value) < value || col_value==null || col_value=="" || col_value=="n/a")
                    ret = false;
            }else{
                // How to break out of a loop ?
                alert("filter not supported");
                return false;
            }

        });
        return ret;
    }

    function hazelnut_draw_callback() {
        var options = this.options;
        /* 
         * Handle clicks on checkboxes: reassociate checkbox click every time
         * the table is redrawn 
         */
        $('.hazelnut-checkbox-' + options.plugin_uuid).unbind('click');
        $('.hazelnut-checkbox-' + options.plugin_uuid).click({instance: this}, check_click);

        if (!this.table)
            return;

        /* Remove pagination if we show only a few results */
        var wrapper = this.table; //.parent().parent().parent();
        var rowsPerPage = this.table.fnSettings()._iDisplayLength;
        var rowsToShow = this.table.fnSettings().fnRecordsDisplay();
        var minRowsPerPage = this.table.fnSettings().aLengthMenu[0];

        if ( rowsToShow <= rowsPerPage || rowsPerPage == -1 ) {
            $('.hazelnut_paginate', wrapper).css('visibility', 'hidden');
        } else {
            $('.hazelnut_paginate', wrapper).css('visibility', 'visible');
        }

        if ( rowsToShow <= minRowsPerPage ) {
            $('.hazelnut_length', wrapper).css('visibility', 'hidden');
        } else {
            $('.hazelnut_length', wrapper).css('visibility', 'visible');
        }
    }

    function check_click (e) {
        var object = e.data.instance;
        var value = this.value;

        if (this.checked) {
            object.current_resources.push(value);
        } else {
            tmp = $.grep(object.current_resources, function(x) { return x != value; });
            object.current_resources = tmp;
        }

        /* inform slice that our selected resources have changed */
        $.publish('/update-set/' + object.options.query_uuid, [object.current_resources, true]);

    }

    function selectAll() {
        // requires jQuery id
        var uuid=this.id.split("-");
        var oTable=$("#hazelnut-"+uuid[1]).dataTable();
        // Function available in Hazelnut 1.9.x
        // Filter : displayed data only
        var filterData = oTable._('tr', {"filter":"applied"});   
        /* TODO: WARNING if too many nodes selected, use filters to reduce nuber of nodes */        
        if(filterData.length<=100){
            $.each(filterData, function(index, obj) {
                var last=$(obj).last();
                var key_value=unfold.get_value(last[0]);
                if(typeof($(last[0]).attr('checked'))=="undefined"){
                    $.publish('selected', 'add/'+key_value);
                }
            });
        }
    }
    
})( jQuery );
