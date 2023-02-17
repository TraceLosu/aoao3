import { MeiliSearch } from 'meilisearch'
import * as ff from '@google-cloud/functions-framework'
import * as admin from 'firebase-admin'
import { Hit } from 'meilisearch/dist/types/types'

admin.initializeApp()
const firestore = admin.firestore()

const search = new MeiliSearch({
    host: `https://${process.env.SEARCH_ENDPOINT}`,
    apiKey: process.env.SEARCH_API_KEY ?? ""
})

ff.http('UpdateTagCompletion', async (req, res) => {
    const archive = search.index('archives')

    const relationships = new Set<string>()
    const characters = new Set<string>()
    const tags = new Set<string>()
    const fandoms = new Set<string>()

    function appendTags(doc: Hit<Record<string, any>>) {
        doc.characters.forEach((i: string) => characters.add(i))
        doc.relationships.forEach((i: string) => relationships.add(i))
        doc.tags.forEach((i: string) => tags.add(i))
        doc.fandoms.forEach((i: string) => fandoms.add(i))
    }

    const lastChecked = (await firestore.collection('cache').doc('tagCompletion').get()).get('lastChecked') as number | undefined

    if (lastChecked == undefined) {
        const maxDocs = (await archive.getStats()).numberOfDocuments

        for (let i = 0; i < maxDocs; i += 10000) {
            const docs = await archive.getDocuments({
                fields: ["relationships", "characters", "tags", "fandoms"],
                offset: i,
                limit: 10000
            })
    
            docs.results.forEach(doc => appendTags(doc))
        }
    } else {
        const docs = (await archive.search(undefined, {
            filter: [`lastChecked > ${lastChecked}`],
            attributesToRetrieve: ["relationships", "characters", "tags", "fandoms"],
            limit: 10000
        }))

        if ((docs.estimatedTotalHits ?? 10000) >= 10000) {
            console.error("Search limit reached!")
        }

        docs.hits.forEach((doc) => appendTags(doc))
    }

    await search.index('relationships').updateDocuments([...relationships].map((val) => { return {key: val} }))
    await search.index('characters').updateDocuments([...characters].map((val) => { return {key: val} }))
    await search.index('fandoms').updateDocuments([...fandoms].map((val) => { return {key: val} }))
    await search.index('tags').updateDocuments([...tags].map((val) => { return {key: val} }))

    res.sendStatus(200).end()
})