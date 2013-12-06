/**
 * Description: display a query result in a Google map
 * Copyright (c) 2012-2013 UPMC Sorbonne Universite - INRIA
 * License: GPLv3
 */

/* BUGS:
 * - infowindow is not properly reopened when the maps does not have the focus
 */

// events that happen in the once-per-view range
googlemap_debug=false;
// more on a on-per-record basis
googlemap_debug_detailed=false;

(function($){

    var GoogleMap = Plugin.extend({

        init: function(options, element) {
            this._super(options, element);

            /* Member variables */
            // query status
            this.received_all = false;
            this.received_set = false;
            this.in_set_backlog = [];

            // we keep a couple of global hashes
	        // lat_lon --> { marker, <ul> }
	        // id --> { <li>, <input> }
	        this.by_lat_lon = {};
	        this.by_id = {};

            /* XXX Events */
            this.elmt().on('show', this, this.on_show);
            // TODO in destructor
            // $(window).unbind('QueryTable');

            var query = manifold.query_store.find_analyzed_query(this.options.query_uuid);
            this.object = query.object;

        //    var keys = manifold.metadata.get_key(this.object);
	    // 
        //    this.key = (keys && keys.length == 1) ? keys[0] : null;

	    // xxx temporary hack
	    // as of nov. 28 2013 we have here this.key='urn', but in any place where
	    // the code tries to access record[this.key] the records only have
	    // keys=type,hrn,network_hrn,hostname
	    // so for now we force using hrn instead
	    // as soon as record have their primary key set this line can be removed
	    // see also same hack in querytable
	    //this.key= (this.key == 'urn') ? 'hrn' : this.key;
        this.key = (this.options.id_key);
        if (typeof(this.key)=='undefined' || (this.key).startsWith("unknown")) {
            // if not specified by caller, decide from metadata
            var keys = manifold.metadata.get_key(this.object);
            this.key = (keys && keys.length == 1) ? keys[0] : null;
        }

            //// Setup query and record handlers 
	    // this query is the one about the slice itself 
	    // event related to this query will trigger callbacks like on_new_record
            this.listen_query(options.query_uuid);
	    // this one is the complete list of resources
	    // and will be bound to callbacks like on_all_new_record
            this.listen_query(options.query_all_uuid, 'all');

            /* GUI setup and event binding */
            this.initialize_map();
        }, // init

        /* PLUGIN EVENTS */

        on_show: function(e) {
	    if (googlemap_debug) messages.debug("googlemap.on_show");
            var googlemap = e.data;
            google.maps.event.trigger(googlemap.map, 'resize');
        }, // on_show

        /* GUI EVENTS */

        /* GUI MANIPULATION */

        initialize_map: function() {
            this.markerCluster = null;
            //create empty LatLngBounds object in order to automatically center the map on the displayed objects
            this.bounds = new google.maps.LatLngBounds();
            var center = new google.maps.LatLng(this.options.latitude, this.options.longitude);
            var myOptions = {
                zoom: this.options.zoom,
                center: center,
		        scrollwheel: false,
                mapTypeId: google.maps.MapTypeId.ROADMAP,
            }
	    
            var domid = this.options.plugin_uuid + '--' + 'googlemap';
	        var elmt = document.getElementById(domid);
	        if (googlemap_debug) messages.debug("gmap.initialize_map based on  domid=" + domid + " elmt=" + elmt);
            this.map = new google.maps.Map(elmt, myOptions);
            this.infowindow = new google.maps.InfoWindow();
        }, // initialize_map

        // The function accepts both records and their id
	// record.key points to the name of the primary key for this record
	// typically this is 'urn'
	record_id : function (input) {
            var id;
            switch (manifold.get_type(input)) {
            case TYPE_VALUE:
		id = input;
                break;
            case TYPE_RECORD:
		if ( ! this.key in input ) return;
                id = input[this.key];
                break;
            default:
                throw "googlemap.record_id: not implemented";
                break;
            }
	    return id;
	},

	// return { marker: gmap_marker, ul : <ul DOM> }
	create_marker_struct: function (object,lat,lon) {
	    // the DOM fragment
	    var dom = $("<p>").addClass("geo").append(object+"(s)");
	    var ul = $("<ul>").addClass("geo");
	    dom.append(ul);
	    // add a gmap marker to the mix
	    var marker = new google.maps.Marker({
		position: new google.maps.LatLng(lat, lon),
                title: object,
		// gmap can deal with a DOM element but not a jquery object
                content: dom.get(0),
        }); 
        //extend the bounds to include each marker's position
        this.bounds.extend(marker.position);
	    return {marker:marker, ul:ul};
	},

	// given an input <ul> element, this method inserts a <li> with embedded checkbox 
	// for displaying/selecting the resource corresponding to the input record
	// returns the created <input> element for further checkbox manipulation
	create_record_checkbox: function (record,ul,checked) {
	    var checkbox = $("<input>", {type:'checkbox', checked:checked, class:'geo'});
	    var id=this.record_id(record);
	    // use hrn as far as possible for displaying
	    // var label= ('hrn' in record) ? record.hrn : id;
	    var label= (this.key in record) ? record[this.key] : id;
	    ul.append($("<li>").addClass("geo").append(checkbox).
		      append($("<span>").addClass("geo").append(label)));
	    var googlemap=this;
	    // the callback for when a user clicks
	    // NOTE: this will *not* be called for changes done by program
	    checkbox.change( function (e) {
		manifold.raise_event (googlemap.options.query_uuid, this.checked ? SET_ADD : SET_REMOVED, id);
	    });
	    return checkbox;
	},
	    
	warning: function (record,message) {
	    try {messages.warning (message+" -- "+this.key+"="+record[this.key]); }
	    catch (err) {messages.warning (message); }
	},
	    
	// retrieve DOM checkbox and make sure it is checked/unchecked
    set_checkbox: function(record, checked) {
	    var id=this.record_id (record);
	    if (! id) { 
		this.warning (record, "googlemap.set_checkbox: record has no id");
		return; 
	    }
	    var checkbox = this.by_id [ id ];
	    if (! checkbox ) { 
		this.warning (record, "googlemap.set_checkbox: checkbox not found");
		return; 
	    }
	    checkbox.prop('checked',checked);
     }, // set_checkbox

	// this record is *in* the slice
        new_record: function(record) {
	        if (googlemap_debug_detailed) messages.debug ("new_record");
            if (!(record['latitude'])) return false;
	    
            // get the coordinates
            var latitude=unfold.get_value(record['latitude']);
            var longitude=unfold.get_value(record['longitude']);
            var lat_lon = latitude + longitude;

    	    // check if we've seen anything at that place already
    	    // xxx might make sense to allow for some fuzziness, 
    	    // i.e. consider 2 places equal if not further away than 300m or so...
    	    var marker_s = this.by_lat_lon [lat_lon];
    	    if ( marker_s == null ) {
        	marker_s = this.create_marker_struct (this.object, latitude, longitude);
        	this.by_lat_lon [ lat_lon ] = marker_s;
        	this.arm_marker(marker_s.marker, this.map);
	    }
	    
    	    // now add a line for this resource in the marker
    	    // xxx should compute checked here ?
    	    // this is where the checkbox will be appended
    	    var ul=marker_s.ul;
    	    var checkbox = this.create_record_checkbox (record, ul, false);
	    var id=this.record_id(record);
	    // used to keep a dict here, but only checkbox is required
            this.by_id[id] = checkbox;
        }, // new_record

        arm_marker: function(marker, map) {
	    if (googlemap_debug_detailed) messages.debug ("arm_marker content="+marker.content);
            var googlemap = this;
            google.maps.event.addListener(marker, 'click', function () {
                googlemap.infowindow.close();
                googlemap.infowindow.setContent(marker.content);
                googlemap.infowindow.open(map, marker);
            });
        }, // arm_marker

        /*************************** QUERY HANDLER ****************************/

        /*************************** RECORD HANDLER ***************************/
        on_new_record: function(record) {
	    if (googlemap_debug_detailed) messages.debug("on_new_record");
            if (this.received_all)
                // update checkbox for record
                this.set_checkbox(record, true);
            else
                // store for later update of checkboxes
                this.in_set_backlog.push(record);
        },

        on_clear_records: function(record) {
	    if (googlemap_debug_detailed) messages.debug("on_clear_records");
        },

        // Could be the default in parent
        on_query_in_progress: function() {
	    if (googlemap_debug) messages.debug("on_query_in_progress (spinning)");
            this.spin();
        },

        on_query_done: function() {
	        if (googlemap_debug) messages.debug("on_query_done");	    
            if (this.received_all) {
                this.unspin();
	        }
            this.received_set = true;
        },

        on_field_state_changed: function(data) {
	    if (googlemap_debug_detailed) messages.debug("on_field_state_changed");	    
            switch(data.request) {
            case FIELD_REQUEST_ADD:
            case FIELD_REQUEST_ADD_RESET:
                this.set_checkbox(data.value, true);
                break;
            case FIELD_REQUEST_REMOVE:
            case FIELD_REQUEST_REMOVE_RESET:
                this.set_checkbox(data.value, false);
                break;
            default:
                break;
            }
        },


        // all : this 

        on_all_new_record: function(record) {
	    if (googlemap_debug_detailed) messages.debug("on_all_new_record");
            this.new_record(record);
        },

        on_all_clear_records: function() {
	    if (googlemap_debug) messages.debug("on_all_clear_records");	    
        },

        on_all_query_in_progress: function() {
	    if (googlemap_debug) messages.debug("on_all_query_in_progress (spinning)");
            // XXX parent
            this.spin();
        },

        on_all_query_done: function() {
	    if (googlemap_debug) messages.debug("on_all_query_done");

            // MarkerClusterer
            var markers = [];
            $.each(this.by_lat_lon, function (k, s) { markers.push(s.marker); });
            this.markerCluster = new MarkerClusterer(this.map, markers, {zoomOnClick: false});
            google.maps.event.addListener(this.markerCluster, "clusterclick", function (cluster) {
                var cluster_markers = cluster.getMarkers();
                var bounds  = new google.maps.LatLngBounds();
                $.each(cluster_markers, function(i, marker){
                    bounds.extend(marker.getPosition()); 
                });
                //map.setCenter(bounds.getCenter(), map.getBoundsZoomLevel(bounds));
                this.map.fitBounds(bounds);
            });
            //now fit the map to the bounds
            this.map.fitBounds(this.bounds);
            // Fix the zoom of fitBounds function, it's too close when there is only 1 marker
            if(markers.length==1){
                this.map.setZoom(this.map.getZoom()-4);
            }
            var googlemap = this;
            if (this.received_set) {
                /* ... and check the ones specified in the resource list */
                $.each(this.in_set_backlog, function(i, record) {
                    googlemap.set_checkbox(record, true);
                });
		// reset 
		googlemap.in_set_backlog = [];

		if (googlemap_debug) messages.debug("unspinning");
                this.unspin();
            }
            this.received_all = true;

        } // on_all_query_done
    });
        /************************** PRIVATE METHODS ***************************/

    $.plugin('GoogleMap', GoogleMap);

})(jQuery);
