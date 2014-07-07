/*
#
# Copyright (c) 2013 NITLab, University of Thessaly, CERTH, Greece
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
#
# This is a MySlice plugin for the NITOS Scheduler
# Nitos Scheduler v1
#
*/

// XXX groupid = all slots those that go with a min granularity

/* some params */
var scheduler2;
var scheduler2Instance;
//is ctrl keyboard button pressed
var schedulerCtrlPressed = false;
//table Id
var schedulerTblId = "scheduler-reservation-table";
var SCHEDULER_FIRST_COLWIDTH = 200;


/* Number of scheduler slots per hour. Used to define granularity. Should be inferred from resources XXX */
var schedulerSlotsPerHour = 6;
var RESOURCE_DEFAULT_GRANULARITY    = 1800 /* s */; // should be computed automatically from resource information
var DEFAULT_GRANULARITY             = 1800 /* s */; // should be computed automatically from resource information. Test with 600
var DEFAULT_PAGE_RANGE = 5;

var schedulerMaxRows = 12;

/* All resources */
var SchedulerData = [];

/* ??? */
var SchedulerSlots = [];

var SchedulerDateSelected = new Date();
// Round to midnight
SchedulerDateSelected.setHours(0,0,0,0);

/* Filtered resources */
var SchedulerDataViewData = [];

var SchedulerSlotsViewData = [];
//Help Variables
var _schedulerCurrentCellPosition = 0;
//Enable Debug
var schedulerDebug = true;
//tmp to delete
var tmpSchedulerLeases = [];

var SCHEDULER_COLWIDTH = 50;


/******************************************************************************
 *                             ANGULAR CONTROLLER                             *
 ******************************************************************************/

// Create a private execution space for our controller. When
// executing this function expression, we're going to pass in
// the Angular reference and our application module.
(function (ng, app) {

    // Define our Controller constructor.
    function Controller($scope) {

        // Store the scope so we can reference it in our
        // class methods
        this.scope = $scope;

        // Set up the default scope value.
        this.scope.errorMessage = null;
        this.scope.name = "";

        //Pagin
        $scope.current_page = 1;
        this.scope.items_per_page = 10;
        $scope.from = 0; // JORDAN

        $scope.instance = null;
        $scope.resources = new Array();
        $scope.slots = SchedulerSlotsViewData;
        $scope.granularity = DEFAULT_GRANULARITY; /* Will be setup */
        //$scope.msg = "hello";

        angular.element(document).ready(function() {
            //console.log('Hello World');
            //alert('Hello World');
            //afterAngularRendered();
        });

        // Pagination

        $scope.range = function() {
            var range_size = $scope.page_count() > DEFAULT_PAGE_RANGE ? DEFAULT_PAGE_RANGE : $scope.page_count();
            var ret = [];
            var start;

            start = $scope.current_page;
            if ( start > $scope.page_count()-range_size ) {
              start = $scope.page_count()-range_size+1;
            }

            for (var i=start; i<start+range_size; i++) {
              ret.push(i);
            }
            return ret;
        };

        $scope.prevPage = function() {
          if ($scope.current_page > 1) {
            $scope.current_page--;
          }
        };

        $scope.prevPageDisabled = function() {
          return $scope.current_page === 1 ? "disabled" : "";
        };
  
        $scope.page_count = function()
        {
            // XXX need visible resources only
            var query_ext, visible_resources_length;
            if (!$scope.instance)
                return 0;
            query_ext = manifold.query_store.find_analyzed_query_ext($scope.instance.options.query_uuid);
            var visible_resources_length = 0;
            query_ext.state.each(function(i, state) {
                if (state[STATE_VISIBLE])
                    visible_resources_length++;
            });
            return Math.ceil(visible_resources_length/$scope.items_per_page);
        };
  
        $scope.nextPage = function() {
          if ($scope.current_page < $scope.page_count()) {
            $scope.current_page++;
          }
        };
  
        $scope.nextPageDisabled = function() {
          return $scope.current_page === $scope.page_count() ? "disabled" : "";
        }; 

        $scope.setPage = function(n) {
            $scope.current_page = n;
        };
        // END pagination

        // FILTER

        $scope.filter_visible = function(resource)
        {
            return manifold.query_store.get_record_state($scope.instance.options.query_uuid, resource['urn'], STATE_VISIBLE);
        };

        // SELECTION

        $scope._create_new_lease = function(resource_urn, start_time, end_time)
        {
            var lease_key, new_lease, data;

            lease_key = manifold.metadata.get_key('lease');

            new_lease = {
                resource:   resource_urn,
                start_time: start_time,
                end_time:   end_time,
            };

            // This is needed to create a hashable object
            new_lease.hashCode = manifold.record_hashcode(lease_key.sort());
            new_lease.equals   = manifold.record_equals(lease_key);

            data = {
                state: STATE_SET,
                key  : null,
                op   : STATE_SET_ADD,
                value: new_lease
            }
            manifold.raise_event($scope.instance.options.query_lease_uuid, FIELD_STATE_CHANGED, data);
            /* Add to local cache also, unless we listen to events from outside */
            if (!(resource_urn in $scope._leases_by_resource))
                $scope._leases_by_resource[resource_urn] = [];
            $scope._leases_by_resource[resource_urn].push(new_lease);
        }

        $scope._remove_lease = function(other)
        {
            var lease_key, other_key, data;

            lease_key = manifold.metadata.get_key('lease');

            // XXX This could be a manifold.record_get_value
            other_key = {
                resource:   other.resource,
                start_time: other.start_time,
                end_time:   other.end_time
            }
            other_key.hashCode = manifold.record_hashcode(lease_key.sort());
            other_key.equals   = manifold.record_equals(lease_key);

            data = {
                state: STATE_SET,
                key  : null,
                op   : STATE_SET_REMOVE,
                value: other_key
            }
            manifold.raise_event($scope.instance.options.query_lease_uuid, FIELD_STATE_CHANGED, data);
            /* Remove from local cache also, unless we listen to events from outside */
            $.grep($scope._leases_by_resource[other.resource], function(x) { return x != other; });

        }

        $scope.select = function(index, model_lease, model_resource)
        {
            var data;

            console.log("Selected", index, model_lease, model_resource);

            var day_timestamp = SchedulerDateSelected.getTime() / 1000;
            var start_time = day_timestamp + index       * model_resource.granularity;
            var end_time   = day_timestamp + (index + 1) * model_resource.granularity;
            var start_date = new Date(start_time * 1000);
            var end_date   = new Date(end_time   * 1000);

            var lease_key = manifold.metadata.get_key('lease');

            // We search for leases in the cache we previously constructed
            var resource_leases = $scope._leases_by_resource[model_resource.urn];

            switch (model_lease.status)
            {
                case 'free': // out
                case 'pendingout':
                    if (resource_leases) {
                        /* Search for leases before */
                        $.each(resource_leases, function(i, other) {
                            if (other.end_time != start_time)
                                return true; // ~ continue
        
                            /* The lease 'other' is just before, and there should not exist
                             * any other lease before it */
                            start_time = other.start_time;
        
                            other_key = {
                                resource:   other.resource,
                                start_time: other.start_time,
                                end_time:   other.end_time
                            }
                            // This is needed to create a hashable object
                            other_key.hashCode = manifold.record_hashcode(lease_key.sort());
                            other_key.equals   = manifold.record_equals(lease_key);
        
                            data = {
                                state: STATE_SET,
                                key  : null,
                                op   : STATE_SET_REMOVE,
                                value: other_key
                            }
                            manifold.raise_event($scope.instance.options.query_lease_uuid, FIELD_STATE_CHANGED, data);
                            /* Remove from local cache also, unless we listen to events from outside */
                            $.grep($scope._leases_by_resource[model_resource.urn], function(x) { return x != other; });
                            return false; // ~ break
                        });
        
                        /* Search for leases after */
                        $.each(resource_leases, function(i, other) {
                            if (other.start_time != end_time)
                                return true; // ~ continue
        
                            /* The lease 'other' is just after, and there should not exist
                             * any other lease after it */
                            end_time = other.end_time;
                            other_key = {
                                resource:   other.resource,
                                start_time: other.start_time,
                                end_time:   other.end_time
                            }
                            // This is needed to create a hashable object
                            other_key.hashCode = manifold.record_hashcode(lease_key.sort());
                            other_key.equals   = manifold.record_equals(lease_key);
        
                            data = {
                                state: STATE_SET,
                                key  : null,
                                op   : STATE_SET_REMOVE,
                                value: other_key
                            }
                            manifold.raise_event($scope.instance.options.query_lease_uuid, FIELD_STATE_CHANGED, other_key);
                            /* Remove from local cache also, unless we listen to events from outside */
                            $.grep($scope._leases_by_resource[model_resource.urn], function(x) { return x != other; });
                            return false; // ~ break
                        });
                    }
        
                    $scope._create_new_lease(model_resource.urn, start_time, end_time);
                    model_lease.status = 'pendingin'; 
                    // unless the exact same lease already existed (pending_out status for the lease, not the cell !!)

                    break;

                case 'selected':
                case 'pendingin':
                    // We remove the cell

                    /* We search for leases including this cell. Either 0, 1 or 2.
                     * 0 : NOT POSSIBLE, should be checked.
                     * 1 : either IN or OUT, we have make no change in the session
                     * 2 : both will be pending, since we have made a change in the session
                    * /!\ need to properly remove pending_in leases when removed again
                     */
                    if (resource_leases) {
                        $.each(resource_leases, function(i, other) {
                            if ((other.start_time <= start_time) && (other.end_time >= end_time)) {
                                // The cell is part of this lease.

                                // If the cell is not at the beginning of the lease, we recreate a lease with cells before
                                if (start_time > other.start_time) {
                                    $scope._create_new_lease(model_resource.urn, other.start_time, start_time);
                                }

                                // If the cell is not at the end of the lease, we recreate a lease with cells after
                                if (end_time < other.end_time) {
                                    $scope._create_new_lease(model_resource.urn, end_time, other.end_time);
                                }
                                
                                // The other lease will be removed
                                $scope._remove_lease(other);
                            }
                            // NOTE: We can interrupt the search if we know that there is a single lease (depending on the status).
                        });
                    }
                
                    // cf comment in previous switch case
                    model_lease.status = 'pendingout'; 

                    break;

                case 'reserved':
                case 'maintainance':
                    // Do nothing
                    break;
            }
            

            $scope._dump_leases();
        };
  
        $scope._dump_leases = function()
        {
            // DEBUG: display all leases and their status in the log
            var leases = manifold.query_store.get_records($scope.instance.options.query_lease_uuid);
            console.log("--------------------");
            $.each(leases, function(i, lease) {
                var key = manifold.metadata.get_key('lease');
                var lease_key = manifold.record_get_value(lease, key);
                var state = manifold.query_store.get_record_state($scope.instance.options.query_lease_uuid, lease_key, STATE_SET);
                var state_str;
                switch(state) {
                    case STATE_SET_IN:
                        state_str = 'STATE_SET_IN';
                        break;
                    case STATE_SET_OUT:
                        state_str = 'STATE_SET_OUT';
                        break;
                    case STATE_SET_IN_PENDING:
                        state_str = 'STATE_SET_IN_PENDING';
                        break;
                    case STATE_SET_OUT_PENDING:
                        state_str = 'STATE_SET_OUT_PENDING';
                        break;
                    case STATE_SET_IN_SUCCESS:
                        state_str = 'STATE_SET_IN_SUCCESS';
                        break;
                    case STATE_SET_OUT_SUCCESS:
                        state_str = 'STATE_SET_OUT_SUCCESS';
                        break;
                    case STATE_SET_IN_FAILURE:
                        state_str = 'STATE_SET_IN_FAILURE';
                        break;
                    case STATE_SET_OUT_FAILURE:
                        state_str = 'STATE_SET_OUT_FAILURE';
                        break;
                }
                console.log("LEASE", new Date(lease.start_time * 1000), new Date(lease.end_time * 1000), lease.resource, state_str);
            });
        };

        // Return this object reference.
        return (this);

    }

    // Define the Controller as the constructor function.
    app.controller("SchedulerCtrl", Controller);

})(angular, ManifoldApp);

/******************************************************************************
 *                              MANIFOLD PLUGIN                               *
 ******************************************************************************/

(function($) {
        scheduler2 = Plugin.extend({

            /** XXX to check
         * @brief Plugin constructor
         * @param options : an associative array of setting values
         * @param element : 
         * @return : a jQuery collection of objects on which the plugin is
         *     applied, which allows to maintain chainability of calls
         */
            init: function(options, element) {
                // Call the parent constructor, see FAQ when forgotten
                this._super(options, element);

                var scope = this._get_scope()
                scope.instance = this;

                // XXX not needed
                scheduler2Instance = this;

                // We need to remember the active filter for datatables filtering
                // XXX not needed
                this.filters = Array();

                // XXX BETTER !!!!
                $(window).delegate('*', 'keypress', function (evt){
                        alert("erm");
                      });

                $(window).keydown(function(evt) {
                    if (evt.which == 17) { // ctrl
                        schedulerCtrlPressed = true;
                    }
                }).keyup(function(evt) {
                    if (evt.which == 17) { // ctrl
                        schedulerCtrlPressed = false;
                    }
                });

                // XXX naming
                //$("#" + schedulerTblId).on('mousedown', 'td', rangeMouseDown).on('mouseup', 'td', rangeMouseUp).on('mousemove', 'td', rangeMouseMove);

                this._resources_received = false;
                this._leases_received = false;
                
                scope._leases_by_resource = {};

                /* Listening to queries */
                this.listen_query(options.query_uuid, 'resources');
                this.listen_query(options.query_lease_uuid, 'leases');

                this.elmt().on('show', this, this.on_show);
                this.elmt().on('shown.bs.tab', this, this.on_show);
                this.elmt().on('resize', this, this.on_resize);

                /* Generate slots according to the default granularity. Should
                 * be updated when resources arrive.  Should be the pgcd in fact XXX */
                this._granularity = DEFAULT_GRANULARITY;
                scope.granularity = this._granularity;
                this._all_slots = this._generate_all_slots();

                // A list of {id, time} dictionaries representing the slots for the given day
                scope.slots = this._all_slots;
                this.scope_resources_by_key = {};

                this.do_resize();
    
                scope.from = 0;

                this._initUI();

            },

            do_resize: function()
            {
                var scope = this._get_scope();

                $('#' + schedulerTblId + ' thead tr th:eq(0)').css("width", SCHEDULER_FIRST_COLWIDTH);
                //self get width might need fix depending on the template 
                var tblwidth = $('#scheduler-reservation-table').parent().outerWidth();

                /* Number of visible cells...*/
                this._num_visible_cells = parseInt((tblwidth - SCHEDULER_FIRST_COLWIDTH) / SCHEDULER_COLWIDTH);
                /* ...should be a multiple of the lcm of all encountered granularities. */
                // XXX Should be updated everytime a new resource is added
                this._lcm_colspan = this._lcm(this._granularity, RESOURCE_DEFAULT_GRANULARITY) / this._granularity;
                this._num_visible_cells = this._num_visible_cells - this._num_visible_cells % this._lcm_colspan;
                /* scope also needs this value */
                scope.num_visible_cells = this._num_visible_cells;
                scope.lcm_colspan = this._lcm_colspan;

                // Slider max value

                if ($('#tblSlider').data('slider') != undefined) {
                    var new_max = (this._all_slots.length - this._num_visible_cells) / this._lcm_colspan;
                    $('#tblSlider').slider('setAttribute', 'max', new_max);
                }

            },

            on_show: function(e)
            {
                var self = e.data;
                self.do_resize();
                self._get_scope().$apply();
            },

            on_resize: function(e)
            {
                var self = e.data;
                self.do_resize();
                self._get_scope().$apply();
            },

            /* Handlers */

            _get_scope : function()
            {
                return angular.element(document.getElementById('SchedulerCtrl')).scope();
            },
            
            _scope_set_resources : function()
            {
                var self = this;
                var scope = this._get_scope();

                var records = manifold.query_store.get_records(this.options.query_uuid);

                scope.resources = [];

                $.each(records, function(i, record) {
                    if (!record.exclusive)
                        return true; // ~ continue

                    // copy not to modify original record
                    var resource = jQuery.extend(true, {}, record);

                    // Fix granularity
                    resource.granularity = typeof(resource.granularity) == "number" ? resource.granularity : RESOURCE_DEFAULT_GRANULARITY;
                    resource.leases = []; // a list of occupied timeslots

                    self.scope_resources_by_key[resource['urn']] = resource;
                    scope.resources.push(resource);
                });
            },

            _scope_clear_leases: function()
            {
                var self = this;
                var scope = this._get_scope();

                // Setup leases with a default free status...
                $.each(this.scope_resources_by_key, function(resource_key, resource) {
                    resource.leases = [];
                    var colspan_lease = resource.granularity / self._granularity; //eg. 3600 / 1800 => 2 cells
                    for (i=0; i < self._all_slots.length / colspan_lease; i++) { // divide by granularity
                        resource.leases.push({
                            id:     'coucou',
                            status: 'free', // 'selected', 'reserved', 'maintenance' XXX pending ??
                        });
                    }
                });

            },

            _scope_set_leases: function()
            {
                var self = this;
                var scope = this._get_scope();
            
                var leases = manifold.query_store.get_records(this.options.query_lease_uuid);
                $.each(leases, function(i, lease) {

                    console.log("SET LEASES", new Date(lease.start_time* 1000));
                    console.log("          ", new Date(lease.end_time* 1000));
                    // XXX We should ensure leases are correctly merged, otherwise our algorithm won't work

                    // Populate leases by resource array: this will help us merging leases later
                    if (!(lease.resource in scope._leases_by_resource))
                        scope._leases_by_resource[lease.resource] = [];
                    scope._leases_by_resource[lease.resource].push(lease);

                    var resource = self.scope_resources_by_key[lease.resource];
                    var day_timestamp = SchedulerDateSelected.getTime() / 1000;

                    var id_start = (lease.start_time - day_timestamp) / resource.granularity;
                    if (id_start < 0) {
                        /* Some leases might be in the past */
                        id_start = 0;
                    }
    
                    var id_end   = (lease.end_time   - day_timestamp) / resource.granularity - 1;
                    var colspan_lease = resource.granularity / self._granularity; //eg. 3600 / 1800 => 2 cells
                    if (id_end >= self._all_slots.length / colspan_lease) {
                        /* Limit the display to the current day */
                        id_end = self._all_slots.length / colspan_lease
                    }

                    for (i = id_start; i <= id_end; i++)
                        // the same slots might be affected multiple times.
                        // PENDING_IN + PENDING_OUT => IN 
                        //
                        // RESERVED vs SELECTED !
                        //
                        // PENDING !!
                        resource.leases[i].status = 'selected'; 
                });
            },

            on_resources_query_done: function(data)
            {
                this._resources_received = true;
                this._scope_set_resources();
                this._scope_clear_leases();
                if (this._leases_received)
                    this._scope_set_leases();
                    
                this._get_scope().$apply();
            },

            on_leases_query_done: function(data)
            {
                this._leases_received = true;
                if (this._resources_received) {
                    this._scope_set_leases();
                    this._get_scope().$apply();
                }
            },

            /* Filters on resources */
            on_resources_filter_added:   function(filter) { this._get_scope().$apply(); },
            on_resources_filter_removed: function(filter) { this._get_scope().$apply(); },
            on_resources_filter_clear:   function()       { this._get_scope().$apply(); },

            /* Filters on leases ? */
            on_leases_filter_added:      function(filter) { this._get_scope().$apply(); },
            on_leases_filter_removed:    function(filter) { this._get_scope().$apply(); },
            on_leases_filter_clear:      function()       { this._get_scope().$apply(); },

            /* INTERNAL FUNCTIONS */

/* XXX IN TEMPLATE XXX
                if (SchedulerDataViewData.length == 0) {
                    $("#plugin-scheduler").hide();
                    $("#plugin-scheduler-empty").show();
                    tmpScope.clearStuff();
                } else {
                    $("#plugin-scheduler-empty").hide();
                    $("#plugin-scheduler").show();
                    // initSchedulerResources
                    tmpScope.initSchedulerResources(schedulerMaxRows < SchedulerDataViewData.length ? schedulerMaxRows : SchedulerDataViewData.length);
                }
*/

            /**
             * Initialize the date picker, the table, the slider and the buttons. Once done, display scheduler.
             */
            _initUI: function() 
            {
                var self = this;

                $("#DateToRes").datepicker({
                    onRender: function(date) {
                        return date.valueOf() < now.valueOf() ? 'disabled' : '';
                    }
                }).on('changeDate', function(ev) {
                    SchedulerDateSelected = new Date(ev.date);
                    SchedulerDateSelected.setHours(0,0,0,0);
                    // Set slider to origin
                    $('#tblSlider').slider('setValue', 0); // XXX
                    // Refresh leases
                    self._scope_clear_leases();
                    self._scope_set_leases();
                    // Refresh display
                    self._get_scope().$apply();
                }).datepicker('setValue', SchedulerDateSelected); //.data('datepicker');

                //init Slider
                $('#tblSlider').slider({
                    min: 0,
                    max: (self._all_slots.length - self._num_visible_cells) / self._lcm_colspan,
                    value: 0,
                }).on('slide', function(ev) {
                    var scope = self._get_scope();
                    scope.from = ev.value * self._lcm_colspan;
                    scope.$apply();
                });

                $("#plugin-scheduler-loader").hide();
                $("#plugin-scheduler").show();
            },

        // PRIVATE METHODS

        /**
         * Greatest common divisor
         */
        _gcd : function(x, y)
        {
            return (y==0) ? x : this._gcd(y, x % y);
        },

        /**
         * Least common multiple
         */
        _lcm : function(x, y)
        {
            return x * y / this._gcd(x, y);
        },
    
        _pad_str : function(i)
        {
            return (i < 10) ? "0" + i : "" + i;
        },

        /**
         * Member variables used:
         *   _granularity
         * 
         * Returns:
         *   A list of {id, time} dictionaries.
         */
        _generate_all_slots: function()
        {
            var slots = [];
            // Start with a random date (a first of a month), only time will matter
            var d = new Date(2014, 1, 1, 0, 0, 0, 0);
            var i = 0;
            // Loop until we change the day
            while (d.getDate() == 1) {
                // Nicely format the time...
                var tmpTime = this._pad_str(d.getHours()) + ':' + this._pad_str(d.getMinutes());
                /// ...and add the slot to the list of results
                slots.push({ id: i, time: tmpTime });
                // Increment the date with the granularity
                d = new Date(d.getTime() + this._granularity * 1000);
                i++;
            }
            return slots;

        },
    });

    /* Plugin registration */
    $.plugin('Scheduler2', scheduler2);

})(jQuery);



