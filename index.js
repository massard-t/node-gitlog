const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const debug = require('debug')('gitlog');
const extend = require('lodash.assign');
const delimiter = '\t';
const fields = {
        hash: '%H',
        abbrevHash: '%h',
        treeHash: '%T',
        abbrevTreeHash: '%t',
        parentHashes: '%P',
        abbrevParentHashes: '%P',
        authorName: '%an',
        authorEmail: '%ae',
        authorDate: '%ai',
        authorDateRel: '%ar',
        committerName: '%cn',
        committerEmail: '%ce',
        committerDate: '%cd',
        committerDateRel: '%cr',
        subject: '%s',
        body: '%B'
};

const notOptFields = ['status', 'files'];

/***
    Add optional parameter to command
*/
const addOptional = (command, options) => {
  const cmdOptional = ['author', 'since', 'after', 'until', 'before', 'committer'];
  for (let i = cmdOptional.length; i--;) {
    if (options[cmdOptional[i]]) {
      command += ` --${cmdOptional[i]}="${options[cmdOptional[i]]}"`;
    }
  }
  return command
};

const gitlog = (new_options, cb) => {
  if (!new_options.repo) {
    throw new Error('Repo required!');
  }

  const defaultOptions = {
          number: 10,
          fields: ['abbrevHash', 'hash', 'subject', 'authorName'],
          nameStatus:true,
          findCopiesHarder:false,
          all:false,
          execOptions: {}
    };

  // Set defaults
  const options = extend(defaultOptions, new_options);

  const prevWorkingDir = process.cwd();
  try {
    process.chdir(options.repo);
  } catch (e) {
    throw new Error('Repo location does not exist');
  }

  // Start constructing command
  let command = 'git log ';

  if (options.findCopiesHarder) {
    command += '--find-copies-harder ';
  }

  if (options.all) {
    command += '--all ';
  }

  command += `-n ${options.number}`;

  let fcommand = addOptional(command, options);

  // Start of custom format
  fcommand += ' --pretty="@begin@';

  // Iterating through the fields and adding them to the custom format
  options.fields.forEach(field => {
    if (!fields[field] && field.indexOf(notOptFields) === -1)
      throw new Error('Unknown field: ' + field);
    fcommand += delimiter + fields[field];
  })

  // Close custom format
  fcommand += '@end@"';

  // Append branch if specified
  if (options.branch) {
    fcommand += ` ${options.branch}`;
  }

  if (options.file) {
    fcommand += ` -- ${options.file}`;
  }

  //File and file status
  fcommand += fileNameAndStatus(options);

  debug('command', options.execOptions, fcommand);

  if (!cb) {
    // run Sync

    const stdout = execSync(fcommand, options.execOptions).toString();
    let commits = stdout.split('\n@begin@');

    if (commits.length === 1 && commits[0] === '' ) {
      commits.shift();
    }

    debug('commits',commits);

    const results = parseCommits(commits, options.fields,options.nameStatus);

    process.chdir(prevWorkingDir);

    return results;
  }

  exec(fcommand, options.execOptions, (err, stdout, stderr) => {
    debug('stdout', stdout);
    let commits = stdout.split('\n@begin@');
    if (commits.length === 1 && commits[0] === '' ) {
      commits.shift();
    }
    debug('commits', commits);

    const results = parseCommits(commits, options.fields, options.nameStatus);

    cb(stderr || err, results);
  });

  process.chdir(prevWorkingDir);
}

const fileNameAndStatus = options => options.nameStatus ? ' --name-status' : '';

const parseCommits = (commits, fields, nameStatus) => {
        console.log(commits);
  return commits.map(commit => {
    const parts = commit.split('@end@\n\n');

    let part = parts[0].split(delimiter);

    if (parts[1]) {
      let parseNameStatus = parts[1].split('\n');

      // Removes last empty char if exists
      if (parseNameStatus[parseNameStatus.length - 1] === '') {
        parseNameStatus.pop();
      }

      // Split each line into it's own delimitered array
      parseNameStatus.forEach((d, i) => {
        parseNameStatus[i] = d.split(delimiter);
      });

      // 0 will always be status, last will be the filename as it is in the commit,
      // anything inbetween could be the old name if renamed or copied
      const cleanedStatus = parseNameStatus.reduce((a, b) => {
        const blen = b.length;
        let tmpArray = [b[0], b[blen - 1]];

        // If any files in between loop through them
        for (let i = 1; i < blen; i++) {
          // If status R then add the old filename as a deleted file + status
          // Other potentials are C for copied but this wouldn't require the original deleting
          if (b[0].slice(0, 1) === 'R') {
            tmpArray.push('D', b[i]);
          }
        }

        result = a.concat(tmpArray);
        return result;
      }, []);

      commit = commit.concat(cleanedStatus);
    }

    debug('commit', commit);

    // Remove the first empty char from the array
    //console.log(commit);
    part.shift();

    let parsed = {};

    if (nameStatus) {
      // Create arrays for non optional fields if turned on
      notOptFields.forEach(d => {
        parsed[d] = [];
      });
    }

    console.log(parsed);
    part.forEach((commitField, index) => {
      if (fields[index]) {
        parsed[fields[index]] = commitField;
      } else {
        if (nameStatus) {
          const pos = (index - fields.length) % notOptFields.length;

          debug('nameStatus', (index - fields.length), notOptFields.length,pos,commitField);
          parsed[notOptFields[pos]].push(commitField);
        }
      }
    })

    console.log(parsed);
    return parsed;
  })
}

module.exports = gitlog;
