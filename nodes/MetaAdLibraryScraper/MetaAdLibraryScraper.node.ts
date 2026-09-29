import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type { OptionField } from './GenericFunctions';
import { applyOptions, requireString, runActorAndGetItems } from './GenericFunctions';

// ScrapeUnblocker's public "Meta Ad Library Scraper" Actor: https://apify.com/scrapeunblocker/meta-ad-library-scraper
const ACTOR_ID = 'jFVKf923KgSwaD3PS';
const INTEGRATION_APP_ID = 'scrapeunblocker-meta-ad-library-scraper';

// Node option name -> Actor input key.
const OPTION_FIELDS: Record<string, OptionField> = {
	country: {
		key: 'country',
		kind: 'upper',
	},
	activeStatus: {
		key: 'active_status',
	},
	mediaType: {
		key: 'media_type',
	},
};

function buildActorInput(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	options: IDataObject,
	itemIndex: number,
): IDataObject {
	const input: IDataObject = {};

	switch (`${resource}:${operation}`) {
		case 'ad:getAll': {
			input.advertiser = requireString.call(this, 'advertiser', 'Advertiser', itemIndex);
			input.max_ads = this.getNodeParameter('maxAds', itemIndex);
			break;
		}
		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for resource "${resource}"`,
				{ itemIndex },
			);
	}

	applyOptions(input, options, OPTION_FIELDS);
	return input;
}

export class MetaAdLibraryScraper implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Meta Ad Library Scraper',
		name: 'metaAdLibraryScraper',
		icon: {
			light: 'file:metaAdLibraryScraper.png',
			dark: 'file:metaAdLibraryScraper.dark.png',
		},
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			"Get an advertiser's Facebook and Instagram ads from the Meta Ad Library with the ScrapeUnblocker Actor on Apify",
		defaults: {
			name: 'Meta Ad Library Scraper',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'apifyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Ad',
						value: 'ad',
					},
				],
				default: 'ad',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['ad'],
					},
				},
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get the ads of one advertiser from the Meta Ad Library',
						action: 'Get many ads',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Advertiser',
				name: 'advertiser',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'Nike',
				description:
					"The advertiser: a Facebook or Instagram Page name (e.g. 'Nike'), matched as a keyword search that can include ads from other Pages, or a numeric Page ID for exactly that advertiser's ads",
				displayOptions: {
					show: {
						resource: ['ad'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Max Ads',
				name: 'maxAds',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 1000,
				},
				default: 50,
				description: 'How many ads to collect for the advertiser (1-1000)',
				displayOptions: {
					show: {
						resource: ['ad'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Ad Status',
						name: 'activeStatus',
						type: 'options',
						options: [
							{
								name: 'Active (Currently Running)',
								value: 'active',
							},
							{
								name: 'All',
								value: 'all',
							},
							{
								name: 'Inactive (Stopped)',
								value: 'inactive',
							},
						],
						default: 'active',
						description: 'Which ads to return by delivery status',
					},
					{
						displayName: 'Country',
						name: 'country',
						type: 'string',
						default: '',
						placeholder: 'US',
						description:
							'ISO-2 code of the country whose ads to show (e.g. US, GB, DE). Ad delivery differs per country. Defaults to US.',
					},
					{
						displayName: 'Media Type',
						name: 'mediaType',
						type: 'options',
						options: [
							{
								name: 'All',
								value: 'all',
							},
							{
								name: 'Image',
								value: 'image',
							},
							{
								name: 'Meme',
								value: 'meme',
							},
							{
								name: 'Video',
								value: 'video',
							},
						],
						default: 'all',
						description: 'Only ads with this creative format',
					},
					{
						displayName: 'Timeout (Seconds)',
						name: 'timeout',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 0,
						description:
							'Maximum run time of the Apify Actor run. 0 keeps the Actor default. A run that times out fails the node.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const { timeout, ...actorOptions } = options;

				const input = buildActorInput.call(this, resource, operation, actorOptions, i);
				const { items: results } = await runActorAndGetItems.call(this, {
					actorId: ACTOR_ID,
					integrationAppId: INTEGRATION_APP_ID,
					input,
					itemIndex: i,
					timeoutSecs: (timeout as number) || undefined,
				});

				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors return an error of their own class unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
