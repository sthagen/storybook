#!/usr/bin/env node

/* eslint-disable global-require */
const { resolve } = require('path');
const execa = require('execa');
const terminalSize = require('window-size');

const getStorybookPackages = async () => {
  const { stdout } = await execa.command(`yarn workspaces list --json`);

  const packages = stdout
    .toString()
    .split('\n')
    .map((v) => JSON.parse(v))
    .filter((v) => v.name.match(/@storybook\/(.)*/g))
    .sort();

  return packages;
};

async function run() {
  const prompts = require('prompts');
  const program = require('commander');
  const chalk = require('chalk');

  const packages = await getStorybookPackages();
  const packageTasks = packages
    .map((package) => {
      return {
        ...package,
        suffix: package.name.replace('@storybook/', ''),
        defaultValue: false,
        helpText: `build only the ${package.name} package`,
      };
    })
    .reduce((acc, next) => {
      acc[next.name] = next;
      return acc;
    }, {});

  const tasks = {
    watch: {
      name: `watch`,
      defaultValue: false,
      suffix: '--watch',
      helpText: 'build on watch mode',
    },
    ...packageTasks,
  };

  const main = program.version('5.0.0').option('--all', `build everything ${chalk.gray('(all)')}`);

  Object.keys(tasks)
    .reduce((acc, key) => acc.option(tasks[key].suffix, tasks[key].helpText), main)
    .parse(process.argv);

  Object.keys(tasks).forEach((key) => {
    // checks if a flag is passed e.g. yarn build --@storybook/addon-docs --watch
    const containsFlag = program.rawArgs.includes(tasks[key].suffix);
    tasks[key].value = containsFlag || program.all;
  });

  let selection;
  let watchMode = false;
  if (
    !Object.keys(tasks)
      .map((key) => tasks[key].value)
      .filter(Boolean).length
  ) {
    selection = await prompts([
      {
        type: 'toggle',
        name: 'mode',
        message: 'Start in watch mode',
        initial: false,
        active: 'yes',
        inactive: 'no',
      },
      {
        type: 'autocompleteMultiselect',
        message: 'Select the packages to build',
        name: 'todo',
        min: 1,
        hint: 'You can also run directly with package name like `yarn build core`, or `yarn build --all` for all packages!',
        optionsPerPage: terminalSize.height - 3, // 3 lines for extra info
        choices: packages.map(({ name: key }) => ({
          value: key,
          title: tasks[key].name || key,
          selected: (tasks[key] && tasks[key].defaultValue) || false,
        })),
      },
    ]).then(({ mode, todo }) => {
      watchMode = mode;
      return todo.map((key) => tasks[key]);
    });
  } else {
    // hits here when running yarn build --packagename
    watchMode = process.argv.includes('--watch');
    selection = Object.keys(tasks)
      .map((key) => tasks[key])
      .filter((item) => item.name !== 'watch' && item.value === true);
  }

  selection.filter(Boolean).forEach((v) => {
    const sub = execa.command(`yarn prepare${watchMode ? ' --watch' : ''}`, {
      cwd: resolve(__dirname, '..', v.location),
      buffer: false,
    });

    sub.stdout.on('data', (data) => {
      process.stdout.write(`${chalk.cyan(v.name)}:\n${data}`);
    });
    sub.stderr.on('data', (data) => {
      process.stderr.write(`${chalk.red(v.name)}:\n${data}`);
    });
  });
}

run().catch((e) => {
  console.log(e);
  process.exit(1);
});
