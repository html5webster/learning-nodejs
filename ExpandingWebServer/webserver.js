var http = require( "http" );
var url  = require( "url" );
var fs   = require( "fs" );
var path = require( "path" );

function do_rename( old_name, new_name, callback ) {
	fs.rename( "albums/"+old_name, "albums/"+new_name, function( err ) {
		if( err ) {
			callback( err );
			return;
		}
		callback( "renamed album" );
	} )
}
function load_album_list( callback ) {
	fs.readdir( "albums/", function( err, directories ) {
		if( err ) {
			callback( err, null );
			return;
		}
		var only_dirs = [];
		(function iterator( index ) {
			if( index === directories.length ) {
				callback( null, { albums: only_dirs } );
				return;		
			}
			fs.stat( "albums/" + directories[index], function( err, stats ) {
				if( err ) {
					callback( err, null);
					return;
				}
				if( stats.isDirectory() === true ) {
					only_dirs.push( {
						"name": directories[index] 
					} );
				}
				iterator( index + 1);	
			} );			
		})( 0 );
		
	} )
}

function load_album( album, page, size, callback ) {
	fs.readdir( "albums/" + album + "/", function( err, list ) {
		if( err ) {
			callback( err, null );
			return;
		}
		var photos = [];
		for( var i=0,len=list.length; i<len; i++ ) {
			photos.push( {
				filename: list[i],
				short_name: album
			} );
		}
		if( page !== undefined && size !== undefined ) {
			var output = photos.slice( page*size, (page*size+size));
			callback( null, { album_data : { photos : output } } );
			return;
		}
		callback( null, list )
	} );
}

function serve_page( req, res ) {
	var core_url = req.parsed_url.pathname;
	var page = core_url.split("/");
	page = page[page.length-1]
	if( page !== "home" ) {
		page = "album";
	} 
	fs.readFile( "basic.html", function( err, contents ) {
		if( err ) {
			handle_error( err, res );
			return;
		}
		contents = contents.toString( "utf-8" );
		contents = contents.replace( "{{PAGE_NAME}}", page );
		res.writeHead( 200, { "Content-Type": "text/html" } );
		res.end( contents );
	} );
}

function serve_static_file(file, res) {
	fs.exists( file, function( exists ) {
		if( !exists ) {
			handle_error( "file_not_found", res );
			return;
		}
		var readStream = fs.createReadStream( file );
	    readStream.on( "error", function( err ) {
			handle_error( err, res );
			return;
		} );

		var file_type = content_type( file );

		res.writeHead( 200, {
			"Content-Type": file_type
		} );
		readStream.on( "readable", function() {
			var d = readStream.read();
			res.write( d );
		} );
		readStream.on( "end", function() {
			//console.log( "'" + file + "' has been read. closing read stream" );
			res.end();
		} );
	} );    
}

function content_type( file ) {
	switch( path.extname( file ) ) {
		case ".jpg" : case ".jpeg": return "image/jpg";
		case ".html": case ".htm" : return "text/html";
		case ".css" : return "text/css";
		case ".js"  : return "text/javascript";
		case ".mp4" : return "video/mp4";
		default     : return "text/plain";
	}
}

function handle_rename( req, res ) {
	var old_name = "";
	var json = "";
	req.on( "readable", function() {
		var d = req.read();
		if( typeof d === "object" && d instanceof Buffer ) {
			d = d.toString( "utf-8" );
		}
		if( typeof d === "string" ) {
			d = d;
		}
		json = ( json !== "" ) ? json + d :  d;
	})
	req.on( "end", function() {
		if( json ) {
			try {
				json = JSON.parse( json );
				do_rename( json.old_name, json.new_name, function( err, data ) {
					if( err !== undefined ) {
						handle_error( err, res );
					}
					handle_success( data, res );
				} );
			}
			catch( e ) {
				handle_error( "invalid_json", res);
			}			
		}
		else {
			handle_error( "no_body", res);
		}
	} );
}

function handle_album_list( req, res ) {
	load_album_list( function( err, list ) {
		if( err !== undefined ) {
			handle_error( err, res );
		}
		handle_success( list, res );

	} );
}

function handle_album( req, res ) {
	var params = req.parsed_url.query;
	//console.log( params )
	var page  = parseInt(params.page,10) || 0;
	var page_size = parseInt(params.size,10) || 1000;
	var album = path.basename( req.url ).replace( path.extname( req.url ),"");

	load_album( album, page, page_size, function( err, list ) {
		if( err !== undefined ) {
			handle_error( err, res );
		}
		handle_success( list, res );
	} );
}

function handle_incoming_request( req, res ) {
	//console.log( "INCOMING REQUEST ");
	//console.log( "url    : " + req.url );
	//console.log( "method : " + req.method );
	req.parsed_url = url.parse( req.url, true );
	var core_url   = req.parsed_url.pathname;
	var method = req.method;

	if( method.toLowerCase() === "post" && core_url.match(/^\/albums\/.*rename\.json/) !== null ) {
		handle_rename( req, res );
	}
	else if( core_url.match(/^\/pages\/.*/) !== null ) {
		serve_page( req, res );
	}
	else if( core_url.match(/^\/templates\/.*/) !== null ) {
		serve_static_file( "templates/" + path.basename( req.url ), res );
	}
	else if( core_url.match(/^\/contents\/.*/) !== null ) {
		serve_static_file( "contents/" + path.basename( req.url ), res );
	}
	else if( core_url === "/albums.json" ) {
		handle_album_list( req, res );
	}
	else if ( core_url.match(/^\/albums\/.*\./) !== null ) {
		handle_album( req, res );
	}
	else if ( core_url === "/favicon.ico" ) {
		handle_success( "", res );
	}
	else {
		handle_error( "Invalid Request URL", res);
	}
}

function handle_error( err, res ) {
	if( err ) {
		var packet = {
			error: err,
			data: null
		}
		res.writeHead( 400, {
			"Content-Type": "application/json"
		} );
		res.end( JSON.stringify( packet ) + "\n" );
	}
}
function handle_success( data, res ) {
	if( data ) {
		var packet = {
			error: null,
			data: data
		}
		res.writeHead( 200, {
			"Content-Type": "application/json"
		} );
		res.end( JSON.stringify( packet ) + "\n" );
	}
}

http.createServer( handle_incoming_request ).listen( 9234 );
