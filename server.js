const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [3276799] });

let db = {
    painel: { nome: "Nome da Loja", desc: "Descrição do Painel", banner: null },
    produtos: [],
    chavePix: "Não definida",
    msgPainelId: null
};

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('painel-vendas')
            .setDescription('Envia o painel da loja')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try { await rest.put(Routes.applicationCommands(clientId), { body: commands }); } catch (e) {}
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        if (!i.guild) return;

        let cargoDono = i.guild.roles.cache.find(r => r.name === 'Dono Sirius');
        let cargoVend = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoDono) cargoDono = await i.guild.roles.create({ name: 'Dono Sirius', color: '#ff0000' });
        if (!cargoVend) cargoVend = await i.guild.roles.create({ name: 'Vendedor Sirius', color: '#00ff6a' });

        // 1. ENVIAR PAINEL
        if (i.isChatInputCommand() && i.commandName === 'painel-vendas') {
            const embed = new EmbedBuilder()
                .setTitle(db.painel.nome)
                .setDescription(db.painel.desc)
                .setColor("#00ff6a")
                .setImage(db.painel.banner);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Ver Opções').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('configurar_loja').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            db.msgPainelId = msg.id;
        }

        // 2. CONFIGURAR (ORDEM EXATA QUE VOCÊ PEDIU)
        if (i.isButton() && i.customId === 'configurar_loja') {
            if (!i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Sem permissão.", ephemeral: true });

            const modal = new ModalBuilder().setCustomId('m_setup').setTitle('Configuração Sirius');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_nome').setLabel('1. NOME DA LOJA').setStyle(TextInputStyle.Short).setValue(db.painel.nome)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_desc').setLabel('2. DESCRIÇÃO (ACIMA DA URL)').setStyle(TextInputStyle.Paragraph).setValue(db.painel.desc)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_config').setLabel('3. URL BANNER | CHAVE PIX').setStyle(TextInputStyle.Short).setPlaceholder("link_da_imagem | sua_chave_pix")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_nome').setLabel('4. NOME DO PRODUTO').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_valor').setLabel('5. VALOR DO PRODUTO').setStyle(TextInputStyle.Short).setRequired(false))
            );
            return await i.showModal(modal);
        }

        if (i.isModalSubmit() && i.customId === 'm_setup') {
            db.painel.nome = i.fields.getTextInputValue('l_nome');
            db.painel.desc = i.fields.getTextInputValue('l_desc');
            
            const config = i.fields.getTextInputValue('l_config');
            if (config.includes('|')) {
                const [url, pix] = config.split('|').map(s => s.trim());
                db.painel.banner = url || db.painel.banner;
                db.chavePix = pix || db.chavePix;
            }

            const pNome = i.fields.getTextInputValue('p_nome');
            const pValor = i.fields.getTextInputValue('p_valor');
            if (pNome) db.produtos.push({ nome: pNome, valor: pValor || "A combinar" });

            const msg = await i.channel.messages.fetch(db.msgPainelId).catch(() => null);
            if (msg) {
                const up = new EmbedBuilder().setTitle(db.painel.nome).setDescription(db.painel.desc).setImage(db.painel.banner).setColor("#00ff6a");
                await msg.edit({ embeds: [up] });
            }
            await i.reply({ content: "✅ Loja atualizada!", ephemeral: true });
        }

        // 3. VER OPÇÕES
        if (i.isButton() && i.customId('ver_opcoes')) {
            if (db.produtos.length === 0) return i.reply({ content: "❌ Sem produtos.", ephemeral: true });
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('comprar').setPlaceholder('Escolha um item')
                    .addOptions(db.produtos.map((p, idx) => ({ label: p.nome, description: `Valor: ${p.valor}`, value: idx.toString() })))
            );
            await i.reply({ content: "Selecione:", components: [menu], ephemeral: true });
        }

        // 4. TICKET
        if (i.isStringSelectMenu() && i.customId === 'comprar') {
            const prod = db.produtos[parseInt(i.values[0])];
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVend.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoDono.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder().setTitle("Revisão").setDescription(`**Produto:** ${prod.nome}\n**Valor:** ${prod.valor}`).setColor("#5865F2");
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pagar').setLabel('Pagar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('del').setLabel('Fechar').setStyle(ButtonStyle.Danger)
            );
            await canal.send({ content: `${i.user}`, embeds: [embed], components: [row] });
            await i.update({ content: `✅ Ticket: ${canal}`, components: [] });
        }

        if (i.isButton() && i.customId === 'pagar') {
            const embed = new EmbedBuilder().setTitle("PIX").setDescription(`Chave:\n\`${db.chavePix}\``).setColor("#00ff6a");
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('conf').setLabel('Confirmar').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('del').setLabel('Fechar').setStyle(ButtonStyle.Danger)
            );
            await i.update({ embeds: [embed], components: [row] });
        }

        if (i.isButton() && i.customId === 'conf') {
            if (!i.member.roles.cache.has(cargoVend.id) && !i.member.roles.cache.has(cargoDono.id)) return i.reply({ content: "❌ Sem permissão.", ephemeral: true });
            await i.reply("✅ Pago! Aguarde o vendedor.");
        }

        if (i.isButton() && i.customId === 'del') await i.channel.delete().catch(() => {});
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
