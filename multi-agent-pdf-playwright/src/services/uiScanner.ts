/**
 * Dynamic UI Scanner Service
 * Crawls application pages and extracts reusable Playwright locators
 */

import chalk from 'chalk';
import { UiElement } from '../types/requirement.types';

export class UiScanner {

  async scan(appUrl: string): Promise<UiElement[]> {

    console.log(chalk.blue(`[UiScanner] Dynamic scan started: ${appUrl}`));

    const allElements: UiElement[] = [];

    try {

      const { chromium } = await import('playwright');

      const browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false'
      });

      const page = await browser.newPage();

      await page.goto(appUrl, {
        waitUntil: 'domcontentloaded'
      });


      // 1. scan landing page
      allElements.push(...await this.collect(page));


      // 2. try automatic login
      await this.tryLogin(page);


      // scan after login
      allElements.push(...await this.collect(page));


      // 3. discover navigation/buttons
      const clickable = await page.locator(
        'button,a,input[type="submit"]'
      ).all();


      for (const item of clickable.slice(0,10)) {

        try {

          if(await item.isVisible()) {

            await item.click({
              timeout:2000
            });

            await page.waitForTimeout(500);

            allElements.push(...await this.collect(page));
          }

        } catch {}
      }


      await browser.close();


      const unique =
        Array.from(
          new Map(
            allElements.map(e=>[
              e.cssSelector ||
              e.text ||
              e.label ||
              e.suggestedLocator,
              e
            ])
          ).values()
        );


      console.log(
        chalk.green(`[UiScanner] Found ${unique.length} UI elements.`)
      );

      return unique;


    } catch(error){

      console.log(
        chalk.red(`[UiScanner] Failed ${(error as Error).message}`)
      );

      return [];
    }

  }



private async tryLogin(page:any){

  try{

    const username =
      page.locator(
        'input[type="text"],input[name*=user],input[id*=user],input[type=email]'
      ).first();


    const password =
      page.locator(
        'input[type=password]'
      ).first();


    if (
      await username.count() &&
      await password.count() &&
      process.env.TEST_USERNAME &&
      process.env.TEST_PASSWORD
    ) {

      await username.fill(process.env.TEST_USERNAME);
      await password.fill(process.env.TEST_PASSWORD);

      await page.locator(
        'button,input[type=submit]'
      )
      .first()
      .click();

      await page.waitForLoadState(
        'domcontentloaded'
      );

    }


  }catch{}

}




private async collect(page:any):Promise<UiElement[]> {


return await page.evaluate(()=>{


const output:any[]=[];


document.querySelectorAll(
`
button,
input,
textarea,
select,
a,
[role],
[data-testid]
`
)
.forEach((el:any)=>{


let selector=null;


if(el.id){

selector='#'+el.id;

}else if(el.dataset?.testid){

selector=
`[data-testid="${el.dataset.testid}"]`;

}else if(el.name){

selector=
`${el.tagName.toLowerCase()}[name="${el.name}"]`;

}


output.push({

tag:el.tagName.toLowerCase(),

role:
el.getAttribute('role') ||
el.tagName.toLowerCase(),

text:
el.innerText ||
el.value ||
null,

label:
el.getAttribute('aria-label') ||
el.name ||
el.id ||
null,

placeholder:
el.placeholder ||
null,

testId:
el.dataset?.testid ||
null,

cssSelector:
selector,


suggestedLocator:
selector
?
`page.locator('${selector}')`
:
`page.locator('${el.tagName.toLowerCase()}')`

});


});


return output;


});


}

}