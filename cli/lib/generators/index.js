
var path = require('path');

//
// Inspired by
// https://github.com/rails/rails/blob/master/railties/lib/rails/generators.rb
// module
//
// Super simplified here.

var generators = module.exports;

// hoist up top level class the generator extend
generators.Base = require('./base');
generators.NamedBase = require('./named-base');

// hidden namespaces don't show up in the help output
generators.hiddenNamespaces = [
  'yeoman:app',
  'sass:app',
  'js:app',
  'jasmine:app',
  'handlebars:app'
];

generators.init = function init(grunt) {
  // get back arguments without the generate prefix
  var cli = grunt.cli,
    args = cli.tasks.slice(1),
    name = args.shift();

  // figure out the base application directory
  generators.cwd = process.cwd();
  generators.gruntfile = grunt.file.findup(generators.cwd, 'Gruntfile.js');
  generators.base = generators.gruntfile ? path.dirname(generators.gruntfile) : generators.cwd;

  // keep reference to this grunt object, so that other method of this module may use its API.
  generators.grunt = grunt;

  // when a Gruntfile is found, make sure to cdinto that path. This is the
  // root of the yeoman app (should probably check few other things too, this
  // gruntfile may be in another project up to this path), otherwise let the
  // default cwd be (mainly for app generator).
  if(generators.gruntfile) {
    // init the grunt config if a Gruntfile was found
    try {
      require(generators.gruntfile).call(grunt, grunt);
    } catch(e) {
      grunt.log.write(msg).error().verbose.error(e.stack).or.error(e);
    }
    process.chdir(generators.base);
  }

  if(!name) {
    return generators.help(args, cli.options, grunt.config());
  }

  generators.invoke(name, args, cli.options, grunt.config());
};

// show help message with available generators
generators.help = function help(args, options, config) {
  var internalPath = path.join(__dirname, '../..'),
    internal = generators.lookupHelp(internalPath, args, options, config),
    users = generators.lookupHelp(process.cwd(), args, options, config),
    all = internal.concat(users);


  // sort out the namespaces
  var namespaces = all.map(function(generator) {
    return generator.namespace;
  });

  // filter hidden namespaces
  namespaces = namespaces.filter(function(ns) {
    return !~generators.hiddenNamespaces.indexOf(ns);
  });

  // group them by namespace
  var groups = {}
  namespaces.forEach(function(namespace) {
    var base = namespace.split(':')[0];
    if(!groups[base]) groups[base] = [];
    groups[base] = groups[base].concat(namespace);
  });

  // default help message
  var out = [
    'Usage: yeoman generate GENERATOR [args] [options]',
    '',
    'General options:',
    '  -h, [--help]     # Print generator\'s options and usage',
    // XXX below are options that are present in rails generators we might want
    // to handle
    '  -p, [--pretend]  # Run but do not make any changes',
    '  -f, [--force]    # Overwrite files that already exist',
    '  -s, [--skip]     # Skip files that already exist',
    '  -q, [--quiet]    # Suppress status output',
    '',
    'Please choose a generator below.',
    ''
  ].join('\n');

  console.log(out);

  // strip out the yeoman base namespace
  groups.yeoman = groups.yeoman.map(function(ns) {
    return ns.replace(/^yeoman:/, '');
  });

  // print yeoman default first
  generators.printList('yeoman', groups.yeoman);
  Object.keys(groups).forEach(function(key) {
    if(key === 'yeoman') return;
    generators.printList(key, groups[key]);
  });
};

// Prints a list of generators.
generators.printList = function printList(base, namespaces) {
  // should use underscore.string for humanize, camelize and so on.
  console.log( base.charAt(0).toUpperCase() + base.slice(1) + ':');
  namespaces.forEach(function(ns) {
    console.log('  ' + ns);
  });
  console.log();
};

// Receives a namespace, arguments and the options list to invoke a generator.
// It's used as the default entry point for the generate command.
generators.invoke = function invoke(namespace, args, options, config) {
  var names = namespace.split(':'),
    name = names.pop(),
    klass = generators.findByNamespace(name, names.join(':'));

  // try by forcing the yeoman namespace, if none is specified
  if(!klass && !names.length) {
    klass = generators.findByNamespace(name, 'yeoman');
  }

  if(!klass) {
    console.log('Could not find generator', namespace);
    return console.log('Tried in:\n' + generators.loadedPath.map(function(path) {
      return ' - ' + path;
    }).join('\n'));
  }

  // create a new generator from this class
  var generator = new klass(args, options, config);

  // hacky, might change.
  // attach the invoke helper to the generator instance
  generator.invoke = invoke;

  // and few other informations
  generator.namespace = klass.namespace;
  generator.generatorName = name;


  // configure the given sourceRoot for this path, if it wasn't already in the
  // Generator constructor.
  if(!generator.sourceRoot()) {
    generator.sourceRoot(path.join(klass.path, 'templates'));
  }

  // validate the generator (show help on missing argument / options)
  var requiredArgs = generator.arguments.some(function(arg) {
    return arg.config && arg.config.required;
  });

  if(!args.length && requiredArgs) {
    return console.log( generator.help() );
  }

  // also show help if --help was specifically passed
  if(options.help) {
    return console.log( generator.help() );
  }

  // and start if off
  generator.run(namespace, {
    args: args,
    options: options,
    config: config
  });
};

//
// Yeoman finds namespaces by looking up special directories, and namespaces
// are directly tied to their file structure.
//
//    findByNamespace('jasmine', 'yeoman', 'integration')
//
// Will search for the following generators:
//
//    "yeoman:jasmine", "jasmine:integration", "jasmine"
//
// Which in turns look for these paths in the load paths:
//
//    generators/yeoman/jasmine/index.js
//    generators/yeoman/jasmine.js
//
//    generators/jasmine/integration/index.js
//    generators/jasmine/integration.js
//
//    generators/jasmine/index.js
//    generators/jasmine.js
//
// Load paths include `lib/` from within the yeoman application (user one), and
// the internal `lib/yeoman` path from within yeoman itself.
//
generators.findByNamespace = function findByNamespace(name, base, context) {
  var lookups = [],
    internal = path.join(__dirname, '../..');

  // keep track of loaded path in lookup case no generator were found, to be able to
  // log where we searched
  generators.loadedPath = [];

  if(base) lookups.push(base + ':' + name);
  if(context) lookups.push(name + ':' + context);
  if(base) lookups.push(base);

  return generators.lookup(lookups) || generators.lookup(lookups, internal);
};

// Receives namespaces in an array and tries to find matching generators in the
// load paths. Load paths include both `yeoman/generators` and `generators`, in
// both the relative-to-gruntfile-directory `./lib/` and yeoman's built-in
// generators `lib/generators`.
generators.lookup = function lookup(namespaces, basedir) {
  var paths = generators.namespacesToPaths(namespaces),
    generator;

  basedir = basedir || generators.base;

  paths.forEach(function(rawPath) {
    if(generator) return;

    ['yeoman/generators', 'generators/yeoman', 'generators'].forEach(function(base) {
      var path = [basedir, 'lib', base, rawPath].join('/');

      try {
        // keep track of loaded path
        generators.loadedPath && generators.loadedPath.push(path);
        // console.log('>>', namespaces, 'search in ', path);
        generator = require(path);
        // dynamically attach the generator filepath where it was found
        // to the given class, and the associated namespace
        generator.path = path;
        generator.namespace = rawPath.split('/').join(':');

      } catch(e) {
        // not a loadpath error? bubble up the exception
        if(!~e.message.indexOf(path)) throw e;
      }
    });
  });

  return generator;
};

// This will try to load any generator in the load path to show in help.
//
// XXX try to lookup for generator files in the node's loadpath too (eg. node_modules)
// Note may end up in the convention than rails, with generator named after
// {name}_generator.js pattern. Easier for path lookup.
generators.lookupHelp = function lookupHelp(basedir, args, options, config) {
  var grunt = generators.grunt;

  basedir = basedir || generators.base;

  var found = ['yeoman/generators', 'generators/yeoman', 'generators'].map(function(p) {
    var prefix = path.join(basedir, 'lib', p),
      pattern = path.join(prefix, '**', 'index.js');

    return grunt.file.expandFiles(pattern).map(function(filepath) {
      var shorten = filepath.slice(prefix.length + 1),
        namespace = shorten.split(path.join('/')).slice(0, -1).join(':');

      return {
        root: prefix,
        path: shorten,
        fullpath: filepath,
        module: require(filepath),
        namespace: namespace
      }
    });
  });

  // reduce it down to a single array
  found = found.reduce(function(a, b) {
    a = a.concat(b);
    return a;
  }, []);

  // filter out non generator based module
  found = found.filter(function(generator) {
    if(typeof generator.module !== 'function') return false;
    generator.instance = new generator.module(args, options, config);
    return generator.instance instanceof generators.Base;
  }).sort(function(a, b) {
    return a.namespace < b.namespace;
  });

  // and ensure we won't return same generator on different namespace
  var paths = [];
  return found.filter(function(generator) {
    var known = !~paths.indexOf(generator.fullpath);
    paths.push(generator.fullpath);
    return known;
  });
};

// Convert namespaces to paths by replacing ":" for "/".
generators.namespacesToPaths = function namespacesToPaths(namespaces) {
  return namespaces.map(function(namespace) {
    return namespace.split(':').join('/');
  });
};
