// scripts/release.js
import fs from 'fs';
import { execSync } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';

const spinner = ora();

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}
function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8', ...opts });
}
function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}
function bump(version, kind) {
  // simple semver bump: x.y.z
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!m) throw new Error(`Некорректная semver-версия: ${version}`);
  let [ , major, minor, patch ] = m.map(Number);
  if (kind === 'major') { major++; minor = 0; patch = 0; }
  else if (kind === 'minor') { minor++; patch = 0; }
  else if (kind === 'patch') { patch++; }
  else return kind; // custom exact string
  return `${major}.${minor}.${patch}`;
}
function gitClean() {
  try {
    const out = sh('git status --porcelain');
    return out.trim().length === 0;
  } catch { return true; }
}

(async () => {
  const pkgPath = path.resolve('package.json');
  const pkg = readJSON(pkgPath);

  // sanity checks
  if (!pkg.name) {
    console.log(chalk.red('Поле "name" отсутствует в package.json'));
    process.exit(1);
  }
  if (!pkg.description) {
    console.log(chalk.yellow('⚠️  В package.json нет "description" — лучше добавить.'));
  }

  // выбрать версию
  const current = pkg.version || '0.0.0';
  const defaultPatch = bump(current, 'patch');
  const { bumpType } = await inquirer.prompt([{
    type: 'list',
    name: 'bumpType',
    message: `Выберите тип релиза (текущая ${current}):`,
    choices: [
      { name: `patch → ${bump(current, 'patch')}`, value: 'patch' },
      { name: `minor → ${bump(current, 'minor')}`, value: 'minor' },
      { name: `major → ${bump(current, 'major')}`, value: 'major' },
      { name: 'custom (вручную)', value: 'custom' },
    ],
    default: 'patch',
  }]);

  let newVersion = (bumpType === 'custom')
    ? (await inquirer.prompt([{ type:'input', name:'v', message:'Введите новую версию:', default: defaultPatch }])).v
    : bump(current, bumpType);

  if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.log(chalk.red(`Неверная версия: ${newVersion}`));
    process.exit(1);
  }

  // проверка git
  if (!gitClean()) {
    const { cont } = await inquirer.prompt([{
      type: 'confirm', name: 'cont',
      message: 'В рабочем дереве есть изменения. Продолжить?', default: false,
    }]);
    if (!cont) process.exit(1);
  }

  // записать версию
  pkg.version = newVersion;
  writeJSON(pkgPath, pkg);
  console.log(chalk.green(`\nВерсия обновлена: ${current} → ${newVersion}\n`));

  // билд
  console.log(chalk.blue('Сборка проекта...'));
  try {
    sh('npm run build', { stdio: 'inherit' });
  } catch (e) {
    console.error(chalk.red('Сборка упала.'), e.stdout || e.message);
    process.exit(1);
  }

  // быстрые проверки dist
  const mustHave = new Set();
  if (pkg.main) mustHave.add(pkg.main);
  if (pkg.types) mustHave.add(pkg.types);
  if (pkg.exports) {
    const ex = pkg.exports;
    for (const key of Object.keys(ex)) {
      const target = ex[key];
      if (typeof target === 'string') mustHave.add(target);
      else {
        for (const k of ['import', 'default', 'require', 'types']) {
          if (target[k]) mustHave.add(target[k]);
        }
      }
    }
  }
  const missing = [...mustHave].filter(p => !exists(p));
  if (missing.length) {
    console.log(chalk.red('В dist отсутствуют заявленные файлы:'), '\n' + missing.map(x => `  - ${x}`).join('\n'));
    process.exit(1);
  }
  if (!exists('dist')) {
    console.log(chalk.red('Нет каталога dist/ — проверь сборку или tsconfig.'));
    process.exit(1);
  }

  // dry-run pack
  console.log(chalk.blue('\nПроверяем состав публикуемого пакета (npm pack --dry-run)...\n'));
  try {
    const json = sh('npm pack --dry-run --json');
    const list = JSON.parse(json)[0]?.files || [];
    list.forEach(f => console.log(chalk.gray('  - ' + f.path)));
  } catch {
    // старые npm без --json
    sh('npm pack --dry-run', { stdio: 'inherit' });
  }

  // publish?
  const { publish } = await inquirer.prompt([{
    type: 'confirm', name: 'publish', message: 'Опубликовать на npm сейчас?', default: true,
  }]);

  if (publish) {
    try {
      spinner.start('Публикация в npm…');
      // Если приватный namespace — убери --access public
      sh('npm publish --access public', { stdio: 'inherit' });
      spinner.succeed('Опубликовано в npm.');
    } catch (e) {
      spinner.fail('Публикация не удалась.');
      console.error(e.stdout || e.message);
      process.exit(1);
    }
  } else {
    console.log(chalk.yellow('Публикация пропущена. Создаю локальный архив пакета...'));
    sh('npm pack', { stdio: 'inherit' });
  }

  // git commit + tag + push
  try {
    sh('git rev-parse --is-inside-work-tree'); // проверка что это git-репо
    sh('git add package.json');
    sh(`git commit -m "chore(release): v${newVersion}"`);
    sh(`git tag v${newVersion}`);
    sh('git push');
    sh('git push --tags');
    console.log(chalk.green('\nКоммит, тэг и пуш завершены.\n'));
  } catch (e) {
    console.log(chalk.yellow('⚠️  Git-операции пропущены или частично завершились. Проверь репозиторий вручную.'));
  }

  console.log(chalk.green(`Готово: ${pkg.name}@${newVersion}\n`));
})();
